// @vitest-environment jsdom

import { Editor } from '@tiptap/core';
import Color from '@tiptap/extension-color';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MarkdownTextStyle } from '@/modules/notes/editor/MarkdownTextStyle';
import { ToastContext } from '@/shared/hooks/useToast';
import type { SourceSegment } from '@/shared/types/domain';

import { SegmentNoteEditor } from './SegmentNoteEditor';

const segment: SourceSegment = {
  bbox: null,
  continuation_group_id: null,
  markdown: 'Source text',
  page_idx: 0,
  segment_type: 'paragraph',
  text: 'Source text',
  uid: 'segment-1'
};

afterEach(cleanup);

describe('SegmentNoteEditor character limit', () => {
  it('serializes text color into the Markdown value passed to the parent', () => {
    const editor = new Editor({
      extensions: [
        StarterKit,
        MarkdownTextStyle,
        Markdown,
        Color.configure({ types: ['textStyle'] })
      ],
      content: 'colored',
      contentType: 'markdown'
    });

    editor.commands.setTextSelection({ from: 1, to: 8 });
    editor.chain().setColor('#da1e28').run();

    expect(editor.getMarkdown()).toContain(
      '<span style="color: #da1e28">colored</span>'
    );
    editor.destroy();
  });

  it('shows the counter and disables save when Markdown exceeds the limit', () => {
    render(
      <ToastContext.Provider value={{ dismiss: vi.fn(), notify: vi.fn(() => 'toast') }}>
        <SegmentNoteEditor
          annotationCount={0}
          busy={false}
          dirty
          noteText={'x'.repeat(501)}
          segment={segment}
          sourceEntryId="entry-1"
          workspaceRoot={null}
          onClose={vi.fn()}
          onModeChange={vi.fn()}
          onNoteTextChange={vi.fn()}
          onSave={vi.fn()}
        />
      </ToastContext.Provider>
    );

    expect(screen.getByText('501 / 500')).toBeTruthy();
    expect(screen.getByRole('button', { name: /保存/ })).toHaveProperty('disabled', true);
  });

  it('keeps serialized text color after the editor is refocused', async () => {
    const coloredNote = '<span style="color: #da1e28">colored</span>';
    const view = render(
      <ToastContext.Provider value={{ dismiss: vi.fn(), notify: vi.fn(() => 'toast') }}>
        <SegmentNoteEditor
          annotationCount={0}
          busy={false}
          dirty
          noteText={coloredNote}
          segment={segment}
          sourceEntryId="entry-1"
          workspaceRoot={null}
          onClose={vi.fn()}
          onModeChange={vi.fn()}
          onNoteTextChange={vi.fn()}
          onSave={vi.fn()}
        />
      </ToastContext.Provider>
    );

    const editor = await waitFor(() => {
      const element = view.container.querySelector('.tiptap');
      if (!element) {
        throw new Error('editor was not mounted');
      }
      return element as HTMLElement;
    });

    const coloredText = await waitFor(() => {
      const element = editor.querySelector('span[style*="color"]');
      if (!element) {
        throw new Error('colored text was not rendered');
      }
      return element as HTMLElement;
    });

    expect(coloredText.textContent).toBe('colored');
    expect(screen.getByText('7 / 500')).toBeTruthy();

    editor.focus();

    expect(editor.querySelector('span[style*="color"]')?.textContent).toBe('colored');
  });

  it('does not count color markup or line breaks in the visible counter', async () => {
    render(
      <ToastContext.Provider value={{ dismiss: vi.fn(), notify: vi.fn(() => 'toast') }}>
        <SegmentNoteEditor
          annotationCount={0}
          busy={false}
          dirty
          noteText={'<span style="color: #da1e28">第一行</span>\n\n第二行'}
          segment={segment}
          sourceEntryId="entry-1"
          workspaceRoot={null}
          onClose={vi.fn()}
          onModeChange={vi.fn()}
          onNoteTextChange={vi.fn()}
          onSave={vi.fn()}
        />
      </ToastContext.Provider>
    );

    expect(await screen.findByText('6 / 500')).toBeTruthy();
  });
});
