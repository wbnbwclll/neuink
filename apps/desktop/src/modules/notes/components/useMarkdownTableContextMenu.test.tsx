// @vitest-environment jsdom

import { Editor } from '@tiptap/core';
import { Table } from '@tiptap/extension-table';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TableRow from '@tiptap/extension-table-row';
import StarterKit from '@tiptap/starter-kit';
import { act, cleanup, fireEvent, render, renderHook } from '@testing-library/react';
import type { MouseEvent } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  TableContextMenu,
  runMarkdownTableCommand,
  useMarkdownTableContextMenu
} from './useMarkdownTableContextMenu';

let editor: Editor | null = null;

beforeEach(() => {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit, Table, TableRow, TableHeader, TableCell],
    content: '<table><tbody><tr><td><p>A</p></td><td><p>B</p></td></tr></tbody></table>'
  });
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: () => editor?.view.dom.querySelector('td') ?? null
  });
});

afterEach(() => {
  cleanup();
  editor?.destroy();
  editor = null;
});

describe('Markdown table context menu', () => {
  it('executes a table command at the captured cell position', () => {
    expect(editor!.getJSON().content?.[0]?.content).toHaveLength(1);

    expect(runMarkdownTableCommand(editor!, 'addRowAfter', 2)).toBe(true);

    expect(editor!.getJSON().content?.[0]?.content).toHaveLength(2);
  });

  it('opens for a native table and closes through Escape', () => {
    const result = renderHook(() =>
      useMarkdownTableContextMenu({ canEdit: true, editor, loadFailed: false })
    );
    const cell = editor!.view.dom.querySelector('td')!;
    const preventDefault = vi.fn();

    act(() => {
      result.result.current.handleEditorContextMenu({
        clientX: 120,
        clientY: 80,
        preventDefault,
        target: cell
      } as unknown as MouseEvent<HTMLDivElement>);
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(result.result.current.tableContextMenu).toMatchObject({ left: 120, top: 80 });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(result.result.current.tableContextMenu).toBeNull();
  });

  it('maps every visible menu action to its command', () => {
    const onRun = vi.fn();
    const result = render(<TableContextMenu left={40} top={40} onRun={onRun} />);

    fireEvent.click(result.getByRole('menuitem', { name: '右侧增加列' }));
    fireEvent.click(result.getByRole('menuitem', { name: '下方增加行' }));
    fireEvent.click(result.getByRole('menuitem', { name: '删除表格' }));

    expect(onRun.mock.calls).toEqual([
      ['addColumnAfter'],
      ['addRowAfter'],
      ['deleteTable']
    ]);
  });
});
