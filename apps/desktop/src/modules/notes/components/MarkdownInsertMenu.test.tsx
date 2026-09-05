// @vitest-environment jsdom

import type { Editor } from '@tiptap/core';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MarkdownInsertMenu } from './MarkdownInsertMenu';

function fakeEditor() {
  const calls: string[] = [];
  const chain = {
    focus: () => chain,
    setParagraph: () => {
      calls.push('setParagraph');
      return chain;
    },
    run: () => {
      calls.push('run');
      return true;
    }
  };
  return {
    calls,
    editor: { chain: () => chain } as unknown as Editor
  };
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('MarkdownInsertMenu', () => {
  it('runs a selected insert command and closes the menu', () => {
    const { calls, editor } = fakeEditor();
    const onClose = vi.fn();
    const result = render(
      <MarkdownInsertMenu
        anchor={{ left: 40, top: 60 }}
        disabled={false}
        editor={editor}
        insertAt={null}
        onClose={onClose}
        onInsertImage={vi.fn()}
      />
    );

    fireEvent.click(result.getByText('正文'));

    expect(calls).toEqual(['setParagraph', 'run']);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape and an outside pointer without running commands', () => {
    const { calls, editor } = fakeEditor();
    const onClose = vi.fn();
    const result = render(
      <MarkdownInsertMenu
        anchor={{ left: 40, top: 60 }}
        disabled={false}
        editor={editor}
        insertAt={null}
        onClose={onClose}
        onInsertImage={vi.fn()}
      />
    );

    fireEvent.keyDown(result.getByPlaceholderText('输入组件类型...'), { key: 'Escape' });
    fireEvent.pointerDown(document.body);

    expect(onClose).toHaveBeenCalledTimes(2);
    expect(calls).toEqual([]);
  });

  it('keeps disabled commands inert and disables unavailable paste', () => {
    const { calls, editor } = fakeEditor();
    const onClose = vi.fn();
    const result = render(
      <MarkdownInsertMenu
        anchor={{ left: 40, top: 60 }}
        contextMenu
        disabled
        editor={editor}
        insertAt={null}
        onClose={onClose}
        onInsertImage={vi.fn()}
      />
    );

    const paste = result.getByRole('button', { name: '粘贴' });
    expect((paste as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(paste);
    fireEvent.click(result.getByRole('button', { name: '插入组件' }));

    expect(calls).toEqual([]);
    expect(onClose).not.toHaveBeenCalled();
  });
});
