// @vitest-environment jsdom

import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useMarkdownBlockDrag } from './useMarkdownBlockDrag';

let editor: Editor | null = null;

function rect({
  bottom,
  left = 0,
  right = 600,
  top
}: {
  bottom: number;
  left?: number;
  right?: number;
  top: number;
}): DOMRect {
  return {
    bottom,
    height: bottom - top,
    left,
    right,
    top,
    width: right - left,
    x: left,
    y: top,
    toJSON: () => ({})
  };
}

function DragHarness({ targetEditor }: { targetEditor: Editor }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const drag = useMarkdownBlockDrag({
    canEdit: true,
    editor: targetEditor,
    loadFailed: false,
    scrollRef
  });

  return (
    <div
      ref={scrollRef}
      data-drag-scroll="true"
      onMouseLeave={drag.handleEditorMouseLeave}
      onMouseMove={drag.handleEditorMouseMove}
      onScroll={drag.handleEditorScroll}
    >
      <div className="tiptap" data-drag-root="true">
        <p data-block-top="0">One</p>
        <p data-block-top="48">Two</p>
        <p data-block-top="96">Three</p>
      </div>
      {drag.dragHandle ? (
        <button
          aria-label="drag block"
          data-block-drag-handle="true"
          type="button"
          onPointerDown={drag.handleBlockPointerDown}
        />
      ) : null}
      <output data-testid="drag-state">{drag.dragState ? 'dragging' : 'idle'}</output>
    </div>
  );
}

function beginGesture(result: ReturnType<typeof render>) {
  const firstBlock = result.getByText('One');
  fireEvent.mouseMove(firstBlock, { clientX: 80, clientY: 20 });
  const handle = result.getByRole('button', { name: 'drag block' });
  fireEvent.pointerDown(handle, { button: 0, clientX: 80, clientY: 20, pointerId: 7 });
}

beforeEach(() => {
  class TestPointerEvent extends MouseEvent {
    readonly pointerId: number;

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  }
  vi.stubGlobal('PointerEvent', TestPointerEvent);

  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement
  ) {
    if (this.dataset.dragScroll) {
      return rect({ bottom: 160, top: 0 });
    }
    if (this.dataset.dragRoot) {
      return rect({ bottom: 136, left: 50, right: 500, top: 0 });
    }
    const blockTop = this.dataset.blockTop;
    if (blockTop !== undefined) {
      const top = Number(blockTop);
      return rect({ bottom: top + 40, left: 50, right: 500, top });
    }
    return rect({ bottom: 0, top: 0 });
  });

  let rangedElement: HTMLElement | null = null;
  vi.spyOn(document, 'createRange').mockReturnValue({
    detach: vi.fn(),
    getBoundingClientRect: () => rangedElement?.getBoundingClientRect() ?? rect({ bottom: 0, top: 0 }),
    selectNodeContents: (node: Node) => {
      rangedElement = node instanceof HTMLElement ? node : null;
    }
  } as unknown as Range);

  editor = new Editor({
    content: '<p>One</p><p>Two</p><p>Three</p>',
    extensions: [StarterKit]
  });
});

afterEach(() => {
  cleanup();
  editor?.destroy();
  editor = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.style.userSelect = '';
  document.body.style.cursor = '';
});

describe('useMarkdownBlockDrag pointer contract', () => {
  it('does not start or reorder before the activation threshold', () => {
    const result = render(<DragHarness targetEditor={editor!} />);
    beginGesture(result);

    fireEvent.pointerMove(window, { clientX: 83, clientY: 22, pointerId: 7 });
    expect(result.getByTestId('drag-state').textContent).toBe('idle');
    fireEvent.pointerUp(window, { pointerId: 7 });

    expect(editor!.getText({ blockSeparator: '|' })).toBe('One|Two|Three');
    expect(document.body.style.userSelect).toBe('');
  });

  it('reorders a top-level block after a valid drag', () => {
    const result = render(<DragHarness targetEditor={editor!} />);
    beginGesture(result);

    fireEvent.pointerMove(window, { clientX: 80, clientY: 130, pointerId: 7 });
    expect(result.getByTestId('drag-state').textContent).toBe('dragging');
    expect(document.body.style.cursor).toBe('grabbing');
    fireEvent.pointerUp(window, { pointerId: 7 });

    expect(editor!.getText({ blockSeparator: '|' })).toBe('Two|Three|One');
    expect(result.getByTestId('drag-state').textContent).toBe('idle');
    expect(document.body.style.cursor).toBe('');
  });

  it('does not commit when the pointer is released outside the editor region', () => {
    const result = render(<DragHarness targetEditor={editor!} />);
    beginGesture(result);

    fireEvent.pointerMove(window, { clientX: 80, clientY: 130, pointerId: 7 });
    expect(result.getByTestId('drag-state').textContent).toBe('dragging');
    fireEvent.pointerMove(window, { clientX: 720, clientY: 130, pointerId: 7 });
    fireEvent.pointerUp(window, { clientX: 720, clientY: 130, pointerId: 7 });

    expect(editor!.getText({ blockSeparator: '|' })).toBe('One|Two|Three');
    expect(result.getByTestId('drag-state').textContent).toBe('idle');
  });

  it('auto-scrolls long content while dragging near the viewport edge', () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    const result = render(<DragHarness targetEditor={editor!} />);
    const scrollElement = result.container.querySelector<HTMLDivElement>('[data-drag-scroll]')!;
    scrollElement.scrollTop = 0;
    beginGesture(result);

    fireEvent.pointerMove(window, { clientX: 80, clientY: 158, pointerId: 7 });
    expect(animationFrames).toHaveLength(1);
    animationFrames.shift()!(16);

    expect(scrollElement.scrollTop).toBeGreaterThan(0);
    fireEvent.pointerCancel(window, { pointerId: 7 });
  });

  it.each(['Escape', 'pointercancel'])(
    'cancels an active drag through %s without changing the document',
    (reason) => {
      const result = render(<DragHarness targetEditor={editor!} />);
      beginGesture(result);
      fireEvent.pointerMove(window, { clientX: 80, clientY: 130, pointerId: 7 });

      if (reason === 'Escape') {
        fireEvent.keyDown(window, { key: 'Escape' });
      } else {
        fireEvent.pointerCancel(window, { pointerId: 7 });
      }

      expect(editor!.getText({ blockSeparator: '|' })).toBe('One|Two|Three');
      expect(result.getByTestId('drag-state').textContent).toBe('idle');
      expect(document.body.style.userSelect).toBe('');
      expect(document.body.style.cursor).toBe('');
    }
  );

  it('restores global pointer styles when unmounted during a drag', () => {
    const result = render(<DragHarness targetEditor={editor!} />);
    beginGesture(result);
    fireEvent.pointerMove(window, { clientX: 80, clientY: 130, pointerId: 7 });
    expect(document.body.style.userSelect).toBe('none');

    result.unmount();

    expect(document.body.style.userSelect).toBe('');
    expect(document.body.style.cursor).toBe('');
    fireEvent.pointerUp(window, { pointerId: 7 });
    expect(editor!.getText({ blockSeparator: '|' })).toBe('One|Two|Three');
  });
});
