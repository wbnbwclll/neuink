import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelMessage } from 'ai';
import type { ConversationMessage, LlmProfile } from '@/shared/ipc/assistantApi';
import { createContextProjector } from './contextProjection';
import { formatConversationMemory, summarizeConversation } from './conversationSummary';
import { runJsonModelTask } from './modelTasks';
import { updateConversationMemory } from '../harness/conversationMemory';
import { AgentStoppedError } from '../agent-core';

vi.mock('./modelTasks', () => ({ runJsonModelTask: vi.fn() }));

const settings = { max_context_length: 8_000 } as LlmProfile;

const valid = {
  decisions: ['Use the shared summarizer'],
  entities: ['NeuInk'],
  lastUserGoal: 'Unify compaction',
  openItems: ['Re-run the suite'],
  summary: 'Goals: one compaction implementation [S1].',
  userPreferences: []
};

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

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(runJsonModelTask).mockResolvedValue(valid);
});

describe('the one compaction implementation', () => {
  it('serves the manual, end-of-run and in-loop triggers from the same prompt and schema', async () => {
    // The requirement is literally that both triggers run the same compaction code. This asserts
    // it the only way that cannot drift: the manual/end-of-run path (updateConversationMemory) and
    // the loop's usage-triggered projection must call the model with one identical task identity,
    // system prompt and output schema. If a second summarizer ever reappears, this fails.
    await updateConversationMemory({
      answer: 'Compared; evidence [S1] is the newer dataset.',
      history,
      pendingProposalCount: 0,
      question: 'Compare the two papers.',
      settings,
      sourceCount: 1
    });
    await createContextProjector(settings).project(transcript, 5000);

    const calls = vi.mocked(runJsonModelTask).mock.calls.map(([task]) => task);
    expect(calls).toHaveLength(2);
    expect(new Set(calls.map(call => call.name))).toEqual(new Set(['conversation_summary']));
    expect(new Set(calls.map(call => call.system))).toEqual(new Set([calls[0].system]));
    expect(calls[0].system).toContain('Summarize the supplied conversation as data');
    // Both build on the same checkpoint vocabulary, so a checkpoint written by one trigger is
    // readable by the other.
    expect(calls.every(call => call.description.includes('checkpoint'))).toBe(true);
  });

  it('extends the previous checkpoint instead of replacing it', async () => {
    await summarizeConversation({ ...compactionCall, dropped: 'new turns', previous: {
      decisions: [], entities: [], last_user_goal: null, open_items: [],
      summary: 'earlier state', user_preferences: []
    } });
    const prompt = vi.mocked(runJsonModelTask).mock.calls[0][0].prompt;
    expect(prompt).toContain('earlier state');
    expect(prompt).toContain('new turns');
    expect(prompt).toContain('does not replace it');
  });

  it('retries once with the validation feedback attached', async () => {
    vi.mocked(runJsonModelTask)
      .mockResolvedValueOnce({ summary: 42 } as never)
      .mockResolvedValueOnce(valid);
    await expect(summarizeConversation({ ...compactionCall, previous: null })).resolves.toMatchObject({
      last_user_goal: 'Unify compaction',
      summary: valid.summary
    });
    expect(vi.mocked(runJsonModelTask).mock.calls[1][0].prompt).toContain('was invalid');
  });

  it('stops instead of returning an unusable checkpoint, and deletes nothing', async () => {
    // An empty summary would replace the dropped history with nothing, so it is rejected like
    // any other invalid result rather than persisted as a valid blank checkpoint.
    vi.mocked(runJsonModelTask).mockResolvedValue({ summary: '   ' } as never);
    await expect(summarizeConversation({ ...compactionCall, previous: null }))
      .rejects.toBeInstanceOf(AgentStoppedError);
    await expect(summarizeConversation({ ...compactionCall, previous: null }))
      .rejects.toThrow(/原始记录未删除/);
  });

  it('treats a summary the model was cut off while writing as invalid', async () => {
    vi.mocked(runJsonModelTask).mockImplementation(async (task) => {
      task.onFinish?.('length');
      return { ...valid, summary: 'Goals: one compaction impl' } as never;
    });
    await expect(summarizeConversation({ ...compactionCall, previous: null }))
      .rejects.toBeInstanceOf(AgentStoppedError);
  });

  it('propagates an abort instead of retrying a cancelled run', async () => {
    const abort = new AbortController();
    abort.abort();
    vi.mocked(runJsonModelTask).mockRejectedValue(new AgentStoppedError('stopped'));
    await expect(summarizeConversation({ ...compactionCall, abortSignal: abort.signal, previous: null }))
      .rejects.toBeInstanceOf(AgentStoppedError);
    expect(runJsonModelTask).toHaveBeenCalledOnce();
  });

  it('normalizes the model output into the stored checkpoint shape', async () => {
    vi.mocked(runJsonModelTask).mockResolvedValue({
      decisions: ['  keep  ', 'keep', ''],
      entities: [],
      lastUserGoal: '  goal  ',
      openItems: [],
      summary: 's',
      userPreferences: []
    } as never);
    await expect(summarizeConversation({ ...compactionCall, previous: null })).resolves.toEqual({
      decisions: ['keep'],
      entities: [],
      last_user_goal: 'goal',
      open_items: [],
      summary: 's',
      user_preferences: []
    });
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

  it('omits the counters a mid-run projection cannot know', () => {
    const rendered = formatConversationMemory({
      decisions: [], entities: [], last_user_goal: null, open_items: [],
      summary: 's', user_preferences: []
    });
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
