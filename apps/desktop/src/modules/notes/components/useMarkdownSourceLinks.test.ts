// @vitest-environment jsdom

import { Editor } from '@tiptap/core';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SourceLink } from '@/shared/types/domain';

import { SourceLinkNode, sourceLinkAnchorIdsInEditor } from '../editor/SourceLinkNode';
import {
  sourceLinkFilters,
  useMarkdownSourceLinks,
  visibleSourceLinks
} from './useMarkdownSourceLinks';

let editor: Editor | null = null;

afterEach(() => {
  cleanup();
  editor?.destroy();
  editor = null;
});

function sourceLink(id: string, segmentType?: SourceLink['sources'][number]['segment_type']) {
  return {
    anchor_id: `anchor-${id}`,
    created_at: '',
    display_text: id,
    link_id: id,
    owner: { entry_id: 'note-entry', kind: 'note', note_id: 'note-1' },
    sources: [
      {
        entry_id: 'source-entry',
        page: 1,
        quote_hash: '',
        segment_type: segmentType,
        segment_uid: `segment-${id}`,
        snapshot_text: id
      }
    ]
  } satisfies SourceLink;
}

describe('Markdown source link panel state', () => {
  const links = [
    sourceLink('table', 'table'),
    sourceLink('paragraph', 'paragraph'),
    sourceLink('unknown')
  ];

  it('builds one stable sorted filter for every active source type', () => {
    expect(sourceLinkFilters(links)).toEqual(['all', 'paragraph', 'table', 'unknown']);
  });

  it('filters sources without changing the active source collection', () => {
    expect(visibleSourceLinks(links, 'table')).toEqual([links[0]]);
    expect(visibleSourceLinks(links, 'all')).toBe(links);
    expect(links).toHaveLength(3);
  });

  it('turns a pasted source marker into one persisted editor source', async () => {
    const createdLink = sourceLink('created', 'paragraph');
    const createSourceLink = vi.fn(async () => createdLink);
    const markDirty = vi.fn();
    const notify = vi.fn(() => 'toast-1');
    const pasteHandlerRef = { current: (_editor: Editor, _text: string) => false };
    const pasteBusyRef = { current: false };
    editor = new Editor({ extensions: [StarterKit, Markdown, SourceLinkNode], content: '' });

    const result = renderHook(() => {
      const [currentLinks, setCurrentLinks] = useState<SourceLink[]>([]);
      const currentLinksRef = useRef<SourceLink[]>([]);
      const markDirtyRef = useRef(markDirty);
      const sourceLinks = useMarkdownSourceLinks({
        canEdit: true,
        changeVersion: 0,
        editor,
        editorScrollRef: { current: null },
        entryId: 'note-entry',
        loadFailed: false,
        loading: false,
        markEditorDirtyRef: markDirtyRef,
        noteId: 'note-1',
        noteLinks: currentLinks,
        noteLinksRef: currentLinksRef,
        notify,
        onCreateSourceLinkFromPaste: createSourceLink,
        pasteSourceLinkBusyRef: pasteBusyRef,
        pasteSourceLinkHandlerRef: pasteHandlerRef,
        setNoteLinks: setCurrentLinks,
        workspaceRoot: null
      });
      return { currentLinks, sourceLinks };
    });

    act(() => {
      expect(
        pasteHandlerRef.current(
          editor!,
          'neuink-source://segment?sourceEntryId=source-entry&segmentUid=segment-created'
        )
      ).toBe(true);
    });

    await waitFor(() => expect(createSourceLink).toHaveBeenCalledWith('source-entry', 'segment-created'));
    await waitFor(() => expect(result.result.current.currentLinks).toEqual([createdLink]));
    expect(sourceLinkAnchorIdsInEditor(editor!)).toEqual(new Set([createdLink.anchor_id]));
    expect(markDirty).toHaveBeenCalledTimes(1);
    expect(pasteBusyRef.current).toBe(false);
  });
});
