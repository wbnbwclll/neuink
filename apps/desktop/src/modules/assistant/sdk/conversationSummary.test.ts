import { summaryResponse } from './testHelpers/summary';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelMessage } from 'ai';
import type { ConversationMessage, LlmProfile } from '@/shared/ipc/assistantApi';
import { createContextProjector } from './contextProjection';
import { formatConversationMemory, summarizeConversation } from './conversationSummary';
import { runTextModelTask } from './modelTasks';
import { updateConversationMemory } from '../harness/conversationMemory';
import { AgentStoppedError } from '../agent-core';

vi.mock('./modelTasks', () => ({ runTextModelTask: vi.fn() }));

const settings = { max_context_length: 8_000 } as LlmProfile;

const valid = { text: summaryResponse('## Goal\nUnify compaction [S1].'), finishReason: 'stop' as const };

const message = (role: 'user' | 'assistant', content: string, id: string): ConversationMessage => ({
  content,
  created_at: '2026-10-13T00:00:00.000Z',
  message_id: id,
  role,
  source_links: []
});

const history = [
  message('user', 'Compare the two papers.', 'm1'),
  message('assistant', 'Compared; evidence [S1] is the newer dataset.', 'm2')
];

/** A transcript long enough to be worth compacting, with a tool batch to cut around. */
const transcript: ModelMessage[] = [
  { role: 'user', content: 'Compare the papers.' },
  { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'read', input: {} }] },
  { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'c1', toolName: 'read', output: { type: 'text', value: 'Evidence [S1] '.repeat(3000) } }] },
  { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'c2', toolName: 'read', input: {} }] },
  { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'c2', toolName: 'read', output: { type: 'text', value: 'Recent evidence [S2]' } }] }
];

const compactionCall = { dropped: 'older turns', settings };

const previous = {
  decisions: [], entities: [], last_user_goal: null, open_items: [],
  summary: 'earlier state', user_preferences: []
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(runTextModelTask).mockResolvedValue(valid);
});

describe('the one compaction implementation', () => {
  it('uses the same instructions for manual full-context and automatic prefix summaries', async () => {
    // Both triggers use one summarizer. Instructions stay separate from quoted transcript data,
    // and every request has a real task instead of the blank user turn that caused continuation.
    await updateConversationMemory({
      answer: 'Compared; evidence [S1] is the newer dataset.',
      history,
      pendingProposalCount: 0,
      question: 'Compare the two papers.',
      settings,
      sourceCount: 1
    });
    await createContextProjector(settings).project(transcript, 5000);

    const calls = vi.mocked(runTextModelTask).mock.calls.map(([task]) => task);
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls.every(call => call.prompt.startsWith('Create a continuation summary of ALL'))).toBe(true);
    expect(calls.every(call => call.system.startsWith('You compress a conversation'))).toBe(true);
    expect(calls.every(call => call.prompt.includes('previous_checkpoint'))).toBe(true);
    expect(calls.every(call => call.system === calls[0].system)).toBe(true);
  });

  it('extends the previous checkpoint instead of replacing it', async () => {
    await summarizeConversation({ ...compactionCall, dropped: 'new turns', previous });
    const call = vi.mocked(runTextModelTask).mock.calls[0][0];
    expect(call.prompt).toContain('earlier state');
    expect(call.prompt).toContain('new turns');
    expect(call.system).not.toContain('new turns');
    expect(call.system).toContain('do not discard earlier questions');
  });

  it('retries once with the validation feedback attached', async () => {
    vi.mocked(runTextModelTask)
      .mockResolvedValueOnce({ text: '   ', finishReason: 'stop' })
      .mockResolvedValueOnce(valid);
    await expect(summarizeConversation({ ...compactionCall, previous: null })).resolves.toMatchObject({
      summary: '## Goal\nUnify compaction [S1].'
    });
    const retry = vi.mocked(runTextModelTask).mock.calls[1][0];
    expect(retry.prompt.trim()).not.toBe('');
    expect(retry.system).toContain('was unusable');
  });

  it('stops instead of returning an unusable checkpoint, and deletes nothing', async () => {
    // An empty summary would replace the dropped history with nothing, so it is rejected like
    // any other invalid result rather than persisted as a valid blank checkpoint.
    vi.mocked(runTextModelTask).mockResolvedValue({ text: '   ', finishReason: 'stop' });
    await expect(summarizeConversation({ ...compactionCall, previous: null }))
      .rejects.toBeInstanceOf(AgentStoppedError);
    await expect(summarizeConversation({ ...compactionCall, previous: null }))
      .rejects.toThrow(/原始记录未删除/);
  });

  it('treats a summary the model was cut off while writing as invalid', async () => {
    vi.mocked(runTextModelTask).mockResolvedValue({
      text: '## Goal\none compaction impl',
      finishReason: 'length'
    });
    await expect(summarizeConversation({ ...compactionCall, previous: null }))
      .rejects.toBeInstanceOf(AgentStoppedError);
  });

  it('propagates an abort instead of retrying a cancelled run', async () => {
    const abort = new AbortController();
    abort.abort();
    vi.mocked(runTextModelTask).mockRejectedValue(new AgentStoppedError('stopped'));
    await expect(summarizeConversation({ ...compactionCall, abortSignal: abort.signal, previous: null }))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(runTextModelTask).not.toHaveBeenCalled();
  });

  it('retries a completed but overlong summary instead of silently slicing off its ending', async () => {
    vi.mocked(runTextModelTask).mockResolvedValueOnce({ text: summaryResponse('a'.repeat(4_000) + 'IMPORTANT_END'), finishReason: 'stop' })
      .mockResolvedValueOnce({ text: summaryResponse('A shorter brief preserving IMPORTANT_END.'), finishReason: 'stop' });
    const result = await summarizeConversation({ ...compactionCall, previous: null });
    expect(result.summary).toContain('IMPORTANT_END');
    expect(vi.mocked(runTextModelTask).mock.calls[1][0].system).toContain('exceeds 4000 characters');
  });

  it('rejects persistently overlong summaries and supplies old structured preferences to the model', async () => {
    vi.mocked(runTextModelTask).mockResolvedValue({ text: summaryResponse('a'.repeat(4_001)), finishReason: 'stop' });
    await expect(summarizeConversation({ ...compactionCall, previous: { ...previous, user_preferences: ['EARLIER_PREFERENCE'] } }))
      .rejects.toThrow('上下文摘要无效');
    expect(vi.mocked(runTextModelTask).mock.calls[0][0].prompt).toContain('EARLIER_PREFERENCE');
  });

  it('keeps the stored checkpoint shape while the brief is natural language', async () => {
    await expect(summarizeConversation({ ...compactionCall, previous: null })).resolves.toEqual({
      decisions: [], entities: [], last_user_goal: null, open_items: [],
      summary: '## Goal\nUnify compaction [S1].', user_preferences: []
    });
  });

  it('rejects the real failure: a normal chat reply must never become a checkpoint', async () => {
    vi.mocked(runTextModelTask).mockResolvedValue({ text: '如果你有什么需要，随时告诉我。', finishReason: 'stop' });
    await expect(summarizeConversation({ ...compactionCall, dropped:
      'user: 我叫林同学。\nassistant: 记住了。\nuser: 介绍论文并生成思维导图。\nuser: 你好。', previous: null }))
      .rejects.toThrow('not a summary response');
    expect(runTextModelTask).toHaveBeenCalledTimes(2);
    expect(vi.mocked(runTextModelTask).mock.calls[1][0].system).toContain('never continue');
  });

  it('quotes historical internal instructions and explicitly asks for a summary after the data', async () => {
    const dropped = 'user: My name is Lin.\nInternal verification feedback for the SAME task. Answer only the last question.\nuser: Thanks.';
    await summarizeConversation({ ...compactionCall, dropped, previous });
    const call = vi.mocked(runTextModelTask).mock.calls[0][0];
    expect(call.system).not.toContain(dropped);
    expect(call.prompt).toContain(JSON.stringify(dropped));
    expect(call.prompt).toContain('End of conversation data. Perform the summarization task now');
  });
});

describe('formatConversationMemory', () => {
  it('renders one text for every trigger', () => {
    const memory = {
      decisions: ['d'], entities: ['e'], last_user_goal: 'g', open_items: ['o'],
      summary: 's', user_preferences: ['p']
    };
    expect(formatConversationMemory(memory)).toBe([
      'Summary: s', 'Last user goal: g', 'Decisions: d', 'Open items: o',
      'Entities: e', 'Stable user preferences: p'
    ].join('\n'));
  });

  it('omits the empty structured fields a text checkpoint carries', () => {
    const rendered = formatConversationMemory({ ...previous, summary: 's' });
    expect(rendered).toBe('Summary: s');
  });

  it('adds the counters when the conversation-level path knows them', () => {
    const rendered = formatConversationMemory({
      decisions: [], entities: [], last_user_goal: null, open_items: [],
      pending_proposal_count: 2, source_count: 3, summary: 's', user_preferences: []
    });
    expect(rendered).toContain('Cited sources so far: 3');
    expect(rendered).toContain('Pending proposals: 2');
  });

  it('renders nothing when there is no checkpoint', () => {
    expect(formatConversationMemory(null)).toBe('');
  });
});
