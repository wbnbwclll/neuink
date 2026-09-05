// @vitest-environment jsdom

import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, describe, expect, it } from 'vitest';

import {
  reorderTopLevelBlocks,
  resolveDropTargetFromLayout
} from './markdownNoteEditorSupport';

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe('Markdown block dragging', () => {
  it('resolves targets from the stable pre-drag layout', () => {
    const layout = [
      { bottom: 40, top: 0 },
      { bottom: 100, top: 48 },
      { bottom: 150, top: 108 }
    ];

    expect(resolveDropTargetFromLayout(layout, 10)).toEqual({ targetIndex: 0, top: 0 });
    expect(resolveDropTargetFromLayout(layout, 80)).toEqual({ targetIndex: 2, top: 100 });
    expect(resolveDropTargetFromLayout(layout, 180)).toEqual({ targetIndex: 3, top: 150 });
  });

  it('moves only the selected top-level node and preserves the remaining document', () => {
    editor = new Editor({
      content: '<p>One</p><p>Two</p><p>Three</p>',
      extensions: [StarterKit]
    });

    reorderTopLevelBlocks(editor, 0, 3);

    expect(editor.getText({ blockSeparator: '|' })).toBe('Two|Three|One');
  });
});
