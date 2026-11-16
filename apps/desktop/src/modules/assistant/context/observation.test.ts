import { describe, expect, it } from 'vitest';
import type { AssistantContext, AssistantSegmentContextItem } from '@/shared/types/assistant';
import { observeWorkspaceContext } from './observation';

const scope = { entry_ids: ['paper'], entry_titles: ['Paper'], tag_ids: [], tag_names: [] };
const selection: AssistantSegmentContextItem = { id: 'ui-id', kind: 'segment', entryId: 'paper', entryTitle: 'Paper',
  segmentUid: 'segment', pageIdx: 0, text: 'FROZEN_BODY_SENTINEL', addedAt: 'then' };

describe('workspace observations', () => {
  it('sends selection references without copying bodies or UI timestamps', async () => {
    const first = await observeWorkspaceContext({ scope, assistantContext: { items: [selection] } });
    const again = await observeWorkspaceContext({ scope, assistantContext: { items: [{ ...selection, id: 'other-ui-id', addedAt: 'now' }] } });
    expect(first).toEqual(again);
    expect(JSON.stringify(first)).not.toContain('FROZEN_BODY_SENTINEL');
    expect(first.pinned_segments[0].context_ref).toContain('selection:paper:segment:');
    const changed = await observeWorkspaceContext({ scope, assistantContext: { items: [{ ...selection, text: 'New content' }] } });
    expect(changed.pinned_segments[0].revision).not.toBe(first.pinned_segments[0].revision);
  });

  it('keeps explicit references distinct from the active paper and preserves clearing', async () => {
    const assistantContext: AssistantContext = { items: [{ id: 'note', addedAt: '', kind: 'entry', entryId: 'other',
      entryTitle: 'Other', contentKind: 'note', contentId: 'n', contentTitle: 'Notes' }] };
    const observed = await observeWorkspaceContext({ scope, assistantContext, currentEntry: { id: 'paper', title: 'Paper' },
      currentNote: { entryId: 'other', entryTitle: 'Other', noteId: 'n', noteTitle: 'Notes' } });
    expect(observed.active_entry?.id).toBe('paper');
    expect(observed.references[0]).toMatchObject({ entry_id: 'other', content_id: 'n' });
    const cleared = await observeWorkspaceContext({ scope });
    expect(cleared.active_note).toBeNull();
    expect(cleared.references).toEqual([]);
  });

  it('tracks browser navigation identity without leaking URL query credentials', async () => {
    const input = { scope, browserTabTarget: { id: 'tab', url: 'https://example.org/paper?token=private', title: 'Page', navigationId: 'one' } };
    const first = await observeWorkspaceContext(input);
    expect(first.browser?.url).toBe('https://example.org/paper');
    expect(JSON.stringify(first)).not.toContain('private');
    expect(await observeWorkspaceContext({ ...input, browserTabTarget: { ...input.browserTabTarget, navigationId: 'two' } })).not.toEqual(first);
  });
});
