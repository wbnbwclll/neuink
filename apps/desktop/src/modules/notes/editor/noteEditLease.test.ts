import { describe, expect, it } from 'vitest';

import {
  clearNoteEditDraft,
  getNoteEditDraft,
  getNoteEditDraftRevision,
  publishNoteEditDraft
} from './noteEditLease';

describe('noteEditLease drafts', () => {
  it('publishes title and Markdown as one versioned snapshot', () => {
    const entryId = 'entry-draft-snapshot';
    const noteId = 'note-draft-snapshot';
    clearNoteEditDraft(entryId, noteId);

    publishNoteEditDraft(entryId, noteId, '# First', 'First title');
    expect(getNoteEditDraft(entryId, noteId)).toEqual({
      markdown: '# First',
      revision: 1,
      title: 'First title'
    });

    publishNoteEditDraft(entryId, noteId, '# First', 'Renamed');
    expect(getNoteEditDraftRevision(entryId, noteId)).toBe(2);
    expect(getNoteEditDraft(entryId, noteId)?.title).toBe('Renamed');

    clearNoteEditDraft(entryId, noteId);
  });
});
