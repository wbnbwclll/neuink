import { describe, expect, it, vi } from 'vitest';
import type { ConversationMessage } from '@/shared/ipc/assistantApi';
import type { AssistantSegmentContextItem } from '@/shared/types/assistant';
import { selectionContextRef } from '../context/observation';
import { createContextReferenceTool } from './contextReferenceTool';

const selection: AssistantSegmentContextItem = { kind: 'segment', id: 'selected', addedAt: '', entryId: 'paper',
  entryTitle: 'Paper', segmentUid: 'segment', pageIdx: 2, text: 'Frozen text that changed on disk later.' };
const call = { toolCallId: 'read', messages: [] };

describe('context reference reads', () => {
  it('reads and paginates the exact frozen selection, registering evidence only after a real read', async () => {
    const addSource = vi.fn(() => 7), emit = vi.fn(), observe = vi.fn();
    const reader = createContextReferenceTool({ assistantContext: { items: [selection] }, history: [], addSource, emit, observe });
    const context_ref = await selectionContextRef(selection);
    const result = await reader.execute!({ context_ref, offset: 7, limit: 100 }, call);
    expect(result).toMatchObject({ marker: '[S7]', text: selection.text.slice(7), snapshot_only: true, more: false });
    expect(addSource).toHaveBeenCalledWith(expect.objectContaining({ quote: selection.text, page_idx: 2 }));
    expect(observe).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ status: 'done' }));
  });

  it('reads archived selections without inventing missing content or using a newer version', async () => {
    const history: ConversationMessage[] = [{ message_id: 'old', role: 'user', content: 'Explain', created_at: '', source_links: [],
      parts: [{ type: 'context-snapshot', items: [selection] }] }];
    const reader = createContextReferenceTool({ history, addSource: () => 1, emit: () => {}, observe: () => {} });
    expect(await reader.execute!({ context_ref: await selectionContextRef(selection) }, call)).toMatchObject({ text: selection.text });
    await expect(reader.execute!({ context_ref: await selectionContextRef({ ...selection, text: 'Changed text' }) }, call))
      .rejects.toThrow('unavailable');
  });

  it('loads an exact prior diagram on demand instead of adding it to every workspace message', async () => {
    const history: ConversationMessage[] = [{ message_id: 'answer', role: 'assistant', content: '', created_at: '', source_links: [],
      parts: [{ type: 'tool-result', id: 'diagram', toolName: 'present_diagram', summary: '',
        diagram: { kind: 'flowchart', code: 'flowchart LR\nA-->B', title: 'Previous' } as never }] }];
    const reader = createContextReferenceTool({ history, addSource: () => 1, emit: () => {}, observe: () => {} });
    expect(await reader.execute!({ context_ref: 'latest_diagram' }, call)).toMatchObject({
      kind: 'historical_diagram', text: 'flowchart LR\nA-->B', snapshot_only: true });
  });
});
