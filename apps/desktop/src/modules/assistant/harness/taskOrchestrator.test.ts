import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AssistantContextSnapshot,
  ConversationMessage,
  LlmProfile
} from '@/shared/ipc/assistantApi';
import { DEFAULT_AGENT_RUNTIME_SETTINGS } from '@/shared/lib/agentRuntimeSettings';

import { orchestrateAssistantTask } from './taskOrchestrator';

const { generateText } = vi.hoisted(() => ({ generateText: vi.fn() }));

vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateText
}));

const profile: LlmProfile = {
  api_key: 'test',
  api_protocol: 'openai_compatible',
  base_url: 'https://example.test/v1',
  id: 'profile',
  max_context_length: 128_000,
  max_output_tokens: 4_000,
  model: 'test-model',
  name: 'Test',
  temperature: 0,
  top_p: 1
};

const snapshot: AssistantContextSnapshot = {
  active_entry: {
    entry_id: 'entry-1',
    entry_title: 'Paper',
    has_pdf: true,
    parse_status: 'completed'
  },
  active_note: null,
  document: null,
  pinned_segments: [],
  warnings: []
};

function modelOutput(patch: Record<string, unknown> = {}) {
  return {
    capabilities: ['propose_note'],
    citationPolicy: 'none',
    clarificationQuestion: null,
    confidence: 0.98,
    deliverables: ['note_create_proposal'],
    entryFields: [],
    evidencePolicy: 'none',
    intent: 'note_create',
    missing: [],
    needsCurrentNote: false,
    needsDocumentContext: false,
    needsNoteProposal: true,
    needsSegmentSearch: false,
    noteAction: 'create',
    rationale: 'The user wants a new Markdown note in the selected paper Entry.',
    requiredToolIds: ['note.propose_create'],
    skillIdsToLoad: [],
    sourcePolicy: 'active_context_only',
    tagAction: null,
    tagEntryIds: [],
    tagId: null,
    tagName: null,
    tagNewName: null,
    targetEntryId: 'entry-1',
    targetKind: 'markdown_note',
    targetNoteId: null,
    targetSegmentUid: null,
    ...patch
  };
}

function message(
  role: ConversationMessage['role'],
  content: string,
  parts: ConversationMessage['parts'] = []
): ConversationMessage {
  return {
    content,
    created_at: '2026-09-03T00:00:00Z',
    message_id: `${role}-${content}`,
    parts,
    role,
    source_links: []
  };
}

async function run(question: string, history: ConversationMessage[] = []) {
  return orchestrateAssistantTask({
    availableEntries: [{ description: '', id: 'entry-1', title: 'Paper', updatedAt: '' }],
    availableNotes: [],
    composerSnapshot: null,
    contextPlan: null,
    conversationHistory: history,
    profiles: [profile],
    question,
    runtimeSettings: DEFAULT_AGENT_RUNTIME_SETTINGS,
    scope: { entry_ids: ['entry-1'], entry_titles: ['Paper'], tag_ids: [], tag_names: [] },
    settings: profile,
    snapshot
  });
}

describe('TaskOrchestratorAgent', () => {
  beforeEach(() => {
    generateText.mockReset();
    generateText.mockResolvedValue({ output: modelOutput() });
  });

  it.each([
    '替我编写一篇关于这个论文的笔记',
    '我希望在这个论文创建新笔记',
    '请你帮我整理一个关于这个论文的阅读笔记'
  ])('routes semantically different note-creation wording through the same structured contract: %s', async (question) => {
    const result = await run(question);

    expect(result.plan.intent).toBe('note_create');
    expect(result.plan.missing).toEqual([]);
    expect(result.requiredToolIds).toEqual(['note.propose_create']);
    expect(result.plan.target).toEqual({
      entryId: 'entry-1',
      kind: 'markdown_note',
      noteId: undefined,
      segmentUid: undefined
    });
  });

  it('supplies the prior semantic checkpoint and recent turn tail to the isolated orchestrator', async () => {
    await run('继续刚才的工作', [
      message('user', '为论文整理阅读笔记'),
      message('assistant', '我已经形成了一个待确认的笔记草稿。', [{
        memory: {
          decisions: ['Use a reading-note structure'],
          entities: ['Paper'],
          last_user_goal: '整理阅读笔记',
          message_count: 2,
          open_items: ['Confirm the note proposal'],
          pending_proposal_count: 1,
          source_count: 2,
          summary: 'A reading note was drafted for the selected paper.',
          updated_at: '2026-09-03T00:00:00Z',
          user_preferences: ['Keep notes concise']
        },
        type: 'memory'
      }])
    ]);

    const prompt = generateText.mock.calls[0][0].prompt as string;
    expect(prompt).toContain('A reading note was drafted for the selected paper.');
    expect(prompt).toContain('继续刚才的工作');
    expect(prompt).toContain('为论文整理阅读笔记');
  });

  it('rejects invented tool ids instead of silently falling back', async () => {
    generateText.mockResolvedValue({
      output: modelOutput({ requiredToolIds: ['write_note_directly'] })
    });

    await expect(run('创建笔记')).rejects.toThrow('unavailable tool ids');
  });

  it('accepts omitted fields that are irrelevant to the selected intent and normalizes plan invariants', async () => {
    generateText.mockResolvedValue({
      output: {
        intent: 'note_create',
        noteAction: 'create',
        requiredToolIds: ['note.propose_create'],
        targetEntryId: 'entry-1',
        targetKind: 'markdown_note'
      }
    });

    const result = await run('给这个论文整理一份笔记');

    expect(result.plan.capabilities).toContain('propose_note');
    expect(result.plan.deliverables).toContain('note_create_proposal');
    expect(result.plan.needsNoteProposal).toBe(true);
  });

  it('feeds validation errors back to the orchestrator and retries once', async () => {
    generateText
      .mockResolvedValueOnce({ output: { intent: 'note_create' } })
      .mockResolvedValueOnce({ output: modelOutput() });

    const result = await run('创建一份阅读笔记');

    expect(result.plan.intent).toBe('note_create');
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(generateText.mock.calls[1][0].prompt).toContain('previous contract was invalid');
  });
});
