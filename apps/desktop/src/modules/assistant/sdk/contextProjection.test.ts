import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelMessage } from 'ai';
import type { LlmProfile } from '@/shared/ipc/assistantApi';
import { contextCut, createContextProjector, type ProjectionState } from './contextProjection';
import { runTextModelTask } from './modelTasks';
import { AgentLocalLimitError, AgentStoppedError, RunBudget } from '../agent-core';
vi.mock('./modelTasks', () => ({ runTextModelTask: vi.fn() }));
const summaryOutput = {
  text: 'Read source [S1], no writes applied.',
  finishReason: 'stop' as const
};
// An 8k window keeps the trigger at 7_200 tokens, so the fixtures below can cross it in a unit test.
const settings = { max_context_length: 8_000 } as LlmProfile;
const messages: ModelMessage[] = [
  { role: 'user', content: 'Compare the papers and preserve citations.' },
  { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'read', input: {} }] },
  { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'c1', toolName: 'read', output: { type: 'text', value: 'Evidence [S1] '.repeat(3000) } }] },
  { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'c2', toolName: 'read', input: {} }] },
  { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'c2', toolName: 'read', output: { type: 'text', value: 'Recent evidence [S2]' } }] }
];
/** A follow-up tool batch large enough to push the cut past the first boundary. */
const grown: ModelMessage[] = [
  ...messages,
  { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'c3', toolName: 'read', input: {} }] },
  { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'c3', toolName: 'read', output: { type: 'text', value: 'Evidence [S3] '.repeat(300) } }] },
  { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'c4', toolName: 'read', input: {} }] },
  { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'c4', toolName: 'read', output: { type: 'text', value: 'Recent evidence [S4]' } }] }
];
const checkpoint = (summary: string) => ({
  decisions: [], entities: [], last_user_goal: null, open_items: [], summary, user_preferences: []
});
const restored = (extra: Partial<ProjectionState>) => ({
  version: 2 as const, firstKeptIndex: 3, memory: checkpoint('Earlier findings [S1] stand.'), markers: ['[S1]'], ...extra
});
// `clearAllMocks` keeps implementations, so a test that stubs a failure would leak into the
// next one. Reset and restore the happy path every time instead.
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(runTextModelTask).mockResolvedValue(summaryOutput);
});
describe('context projection', () => {
  it('does not spend the final response budget on another model summary', async () => {
    const budget = new RunBudget(3);
    budget.turns = 3;
    const projected = await createContextProjector(settings, budget).project(messages, 5000);
    expect(runTextModelTask).not.toHaveBeenCalled();
    expect(JSON.stringify(projected)).toContain('NOT a complete summary');
    expect(projected.slice(-2)).toEqual(messages.slice(-2));
    expect(budget.turns).toBe(3);
  });
  it('also skips model compaction when the individual agent is finalizing', async () => {
    await createContextProjector(settings).project(messages, 5000, undefined, false);
    expect(runTextModelTask).not.toHaveBeenCalled();
  });
  it('retains tool-call/result pairs and never mutates canonical evidence', async () => {
    const before = JSON.stringify(messages);
    expect(contextCut(messages, 5000)).toBe(3);
    const projected = await createContextProjector(settings).project(messages, 5000);
    expect(projected.slice(-2)).toEqual(messages.slice(-2));
    expect(JSON.stringify(projected)).toContain('[S1]');
    expect(JSON.stringify(messages)).toBe(before);
  });
  it('renders readable turns instead of raw message JSON for the summarizer', async () => {
    // A huge tool result used to push every user turn out of a tail-sliced JSON string, so the
    // summarizer received only repeated evidence and no conversation.
    await createContextProjector(settings).project(messages, 5000);
    const system = vi.mocked(runTextModelTask).mock.calls[0][0].system;
    expect(system).toContain('User: Compare the papers and preserve citations.');
    expect(system).toContain('Tool result (read): Evidence [S1]');
    expect(system).not.toContain('"role":"user"');
  });
  it('summarizes only the newly dropped slice once a boundary exists', async () => {
    const projector = createContextProjector(settings);
    await projector.project(messages, 5000);
    expect(runTextModelTask).toHaveBeenCalledOnce();
    await projector.project(grown, 5000);
    expect(runTextModelTask).toHaveBeenCalledTimes(2);
    expect(runTextModelTask).toHaveBeenLastCalledWith(expect.objectContaining({
      prompt: expect.stringMatching(/^\s*$/),
      system: expect.stringContaining('Read source [S1]')
    }));
    // Nothing new was dropped, so the same transcript must not buy another summary.
    await projector.project(grown, 5000);
    expect(runTextModelTask).toHaveBeenCalledTimes(2);
  });
  it('reproduces the same projection after a restore instead of paying for a new summary', async () => {
    let captured: ProjectionState | undefined;
    const first = await createContextProjector(settings, undefined, { onState: (state) => { captured = state; } }).project(messages, 5000);
    expect(runTextModelTask).toHaveBeenCalledOnce();
    const again = await createContextProjector(settings, undefined, { restored: captured }).project(messages, 5000);
    expect(runTextModelTask).toHaveBeenCalledOnce();
    expect(again).toEqual(first);
  });
  it('discards a corrupt boundary and recomputes rather than failing the run', async () => {
    const tooFar = await createContextProjector(settings, undefined, {
      restored: restored({ firstKeptIndex: 999, markers: [] })
    }).project(messages, 5000);
    expect(runTextModelTask).toHaveBeenCalledOnce();
    expect(JSON.stringify(tooFar)).toContain('Read source [S1]');
    const orphaned = await createContextProjector(settings, undefined, {
      restored: restored({ firstKeptIndex: 2, markers: [] })
    }).project(messages, 5000);
    expect(JSON.stringify(orphaned)).toContain('Read source [S1]');
    // A payload in the retired shape is dropped the same way, not trusted as a summary.
    const legacy = await createContextProjector(settings, undefined, {
      restored: { version: 1, firstKeptIndex: 3, summary: 'stale', markers: [] }
    }).project(messages, 5000);
    expect(JSON.stringify(legacy)).toContain('Read source [S1]');
  });
  it('never moves the boundary backwards', async () => {
    const states: ProjectionState[] = [];
    const projector = createContextProjector(settings, undefined, { onState: (state) => states.push(state) });
    await projector.project(grown, 5000);
    const advanced = states[states.length - 1].firstKeptIndex;
    expect(advanced).toBeGreaterThan(3);
    // A roomier budget yields a smaller cut, which must not reopen already-compacted history.
    await projector.project(grown, 20000);
    expect(states[states.length - 1].firstKeptIndex).toBe(advanced);
    expect(runTextModelTask).toHaveBeenCalledOnce();
  });
  it('fails without deleting an oversized request or incomplete tool batch', async () => {
    const oversized = [{ role: 'user' as const, content: 'x'.repeat(40_000) }];
    await expect(createContextProjector(settings).project(oversized, 3000)).rejects.toMatchObject({ reason: 'context_capacity' });
    await expect(createContextProjector(settings).project(oversized, 3000)).rejects.toBeInstanceOf(AgentLocalLimitError);
    expect(runTextModelTask).not.toHaveBeenCalled();
  });
  it('does not label an invalid compaction result as a recoverable local capacity limit', async () => {
    vi.mocked(runTextModelTask).mockResolvedValue({ text: '', finishReason: 'stop' });
    const caught = await createContextProjector(settings).project(messages, 5000).catch(error => error);
    expect(caught).toBeInstanceOf(AgentStoppedError);
    expect(caught).not.toBeInstanceOf(AgentLocalLimitError);
  });
  it('never persists a summary the model was cut off while writing', async () => {
    // A 'length' stop means the text is half a sentence. It is retried, and if it stays
    // truncated nothing is written — a boundary pointing at a partial summary would be worse.
    vi.mocked(runTextModelTask).mockResolvedValue({
      text: 'Goals: compare the pa',
      finishReason: 'length'
    });
    const states: ProjectionState[] = [];
    const projector = createContextProjector(settings, undefined, { onState: (state) => states.push(state) });
    await expect(projector.project(messages, 5000)).rejects.toBeInstanceOf(AgentStoppedError);
    expect(states).toEqual([]);
  });
});
describe('usage anchor', () => {
  it('does not compact while the provider-reported usage says there is room', async () => {
    const projector = createContextProjector(settings);
    projector.recordUsage(1_000, messages.length);
    expect(await projector.project(messages, 5000)).toHaveLength(messages.length);
    expect(runTextModelTask).not.toHaveBeenCalled();
  });
  it('compacts once the anchored usage crosses the trigger', async () => {
    const projector = createContextProjector(settings);
    projector.recordUsage(9_000, messages.length);
    const projected = await projector.project(messages, 5000);
    expect(runTextModelTask).toHaveBeenCalledOnce();
    expect(projected.length).toBeLessThan(messages.length);
  });
  it('clears the anchor on unusable usage and falls back to estimating everything', async () => {
    const projector = createContextProjector(settings);
    projector.recordUsage(1_000, messages.length);
    await projector.project(messages, 5000);
    expect(runTextModelTask).not.toHaveBeenCalled();
    projector.recordUsage(undefined, messages.length);
    await projector.project(messages, 5000);
    expect(runTextModelTask).toHaveBeenCalledOnce();
  });
  it('honours a restored anchor so a restart does not re-summarize', async () => {
    const projector = createContextProjector(settings, undefined, { restored: restored({ inputTokens: 900, requestLength: grown.length }) });
    const projected = await projector.project(grown, 5000);
    expect(runTextModelTask).not.toHaveBeenCalled();
    expect(projected).toHaveLength(grown.length - 3 + 1);
  });
  it('drops an anchor that measures a longer transcript than the one restored', async () => {
    // requestLength beyond these messages would freeze the estimate below the trigger and
    // silently stop compaction forever, so the anchor is discarded and the context re-estimated.
    const projector = createContextProjector(settings, undefined, { restored: restored({ inputTokens: 900, requestLength: 99 }) });
    await projector.project(grown, 5000);
    expect(runTextModelTask).toHaveBeenCalledOnce();
  });
});
