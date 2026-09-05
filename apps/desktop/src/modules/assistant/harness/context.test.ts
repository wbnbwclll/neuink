import { describe, expect, it } from 'vitest';

import type { AssistantContext } from '@/shared/types/assistant';

import { observeAssistantContext } from './context';

describe('observeAssistantContext', () => {
  it('uses the active PDF Entry when no explicit context is selected', () => {
    const observed = observeAssistantContext({
      fallbackEntryId: 'paper-entry'
    });

    expect(observed.activeEntryId).toBe('paper-entry');
  });

  it('keeps an explicit selected Entry while exposing the focused surface separately', () => {
    const observed = observeAssistantContext({
      activeSurface: {
        capturedAt: '2026-07-20T00:00:00Z', entryId: 'focused-entry', kind: 'pdf',
        noteId: null, pane: 'right', segmentUid: null, surfaceKey: 'pdf:focused-entry'
      },
      assistantContext: {
        items: [{
          addedAt: '', contentKind: 'entry', entryId: 'selected-entry', entryTitle: 'Selected',
          id: 'entry:selected-entry', kind: 'entry'
        }]
      }
    });

    expect(observed.activeEntryId).toBe('selected-entry');
    expect(observed.activeSurface?.entryId).toBe('focused-entry');
  });

  it('hydrates a single selected Markdown reference as a resolvable note target', () => {
    const assistantContext: AssistantContext = {
      items: [
        {
          addedAt: '2026-07-13T00:00:00.000Z',
          contentId: 'note-2',
          contentKind: 'note',
          contentTitle: '实验笔记',
          entryId: 'paper-entry',
          entryTitle: 'Paper',
          id: 'entry:paper-entry:note:note-2',
          kind: 'entry'
        }
      ]
    };

    const observed = observeAssistantContext({
      assistantContext,
      fallbackEntryId: 'other-entry',
      fallbackNote: { entryId: 'other-entry', noteId: 'note-1' }
    });

    expect(observed.activeEntryId).toBe('paper-entry');
    expect(observed.activeNote).toEqual({ entryId: 'paper-entry', noteId: 'note-2' });
  });

  it('hydrates a Markdown only when the context plan marks it as the edit target', () => {
    const item = {
      addedAt: '', contentId: 'note-2', contentKind: 'note' as const,
      contentTitle: '实验笔记', entryId: 'paper-entry', entryTitle: 'Paper',
      id: 'entry:paper-entry:note:note-2', kind: 'entry' as const
    };
    const observed = observeAssistantContext({
      assistantContext: { items: [item] },
      contextPlan: {
        editTarget: { attachmentId: item.id, targetKind: 'markdown_note' },
        items: [{
          attachmentId: item.id, contentId: item.contentId, entryId: item.entryId,
          entryTitle: item.entryTitle, hydration: 'full_if_budget', kind: 'note',
          reason: 'Explicit target', role: 'edit_target'
        }],
        summary: 'one target'
      }
    });

    expect(observed.activeNote).toEqual({ entryId: 'paper-entry', noteId: 'note-2' });
  });

  it('does not fall back to the open note when multiple Markdown notes are selected', () => {
    const assistantContext: AssistantContext = {
      items: ['note-1', 'note-2'].map((noteId) => ({
        addedAt: '', contentId: noteId, contentKind: 'note' as const,
        contentTitle: noteId, entryId: 'paper-entry', entryTitle: 'Paper',
        id: `entry:paper-entry:note:${noteId}`, kind: 'entry' as const
      }))
    };

    const observed = observeAssistantContext({
      assistantContext,
      fallbackNote: { entryId: 'paper-entry', noteId: 'open-note' }
    });

    expect(observed.activeNote).toBeNull();
  });

  it('uses a pinned Segment Entry as the active Entry when it is the only context', () => {
    const observed = observeAssistantContext({
      assistantContext: {
        items: [{
          addedAt: '', entryId: 'segment-entry', entryTitle: 'Paper',
          id: 'segment:segment-entry:segment-1', kind: 'segment', pageIdx: 0,
          segmentUid: 'segment-1', text: 'Evidence'
        }]
      },
      fallbackEntryId: 'other-entry'
    });

    expect(observed.activeEntryId).toBe('segment-entry');
  });
});
