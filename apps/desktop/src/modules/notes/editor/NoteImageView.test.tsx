// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@testing-library/react';
import type { ComponentProps, ElementType } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NoteImageView } from './NoteImageView';

vi.mock('@tiptap/react', () => ({
  NodeViewWrapper: ({ as: Wrapper = 'div', ...props }: ComponentProps<'div'> & { as?: ElementType }) => {
    const Component = Wrapper;
    return <Component {...props} />;
  }
}));

function imageProps(
  updateAttributes = vi.fn(),
  editorRoot = document.createElement('div')
) {
  return {
    editor: { view: { dom: editorRoot } },
    extension: { options: { entryId: 'entry-1', noteId: 'note-1' } },
    node: {
      attrs: {
        alignment: 'center',
        alt: '示例图片',
        src: 'https://example.com/image.png',
        width: 60
      }
    },
    selected: true,
    updateAttributes
  } as unknown as Parameters<typeof NoteImageView>[0];
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
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('NoteImageView', () => {
  it('updates alignment and clamps direct width input', () => {
    const updateAttributes = vi.fn();
    const result = render(<NoteImageView {...imageProps(updateAttributes)} />);

    fireEvent.click(result.getByRole('button', { name: '左对齐' }));
    fireEvent.change(result.getByRole('spinbutton', { name: '图片宽度百分比' }), {
      target: { value: '4' }
    });

    expect(updateAttributes).toHaveBeenNthCalledWith(1, { alignment: 'left' });
    expect(updateAttributes).toHaveBeenNthCalledWith(2, { width: 10 });
  });

  it('keeps the resize control under the pointer through pointer release', () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    const scrollBy = vi.fn();
    const scrollContainer = document.createElement('div');
    scrollContainer.style.overflowY = 'auto';
    Object.defineProperties(scrollContainer, {
      clientHeight: { configurable: true, value: 200 },
      scrollHeight: { configurable: true, value: 500 }
    });
    scrollContainer.scrollBy = scrollBy;
    const editorRoot = document.createElement('div');
    scrollContainer.append(editorRoot);
    document.body.append(scrollContainer);
    const props = imageProps(vi.fn(), editorRoot);

    const result = render(<NoteImageView {...props} />, { container: editorRoot });
    const slider = result.getByRole('slider', { name: '图片缩放' });
    let sliderTop = 420;
    vi.spyOn(slider, 'getBoundingClientRect').mockImplementation(() => ({
      bottom: sliderTop + 20,
      height: 20,
      left: 0,
      right: 100,
      top: sliderTop,
      width: 100,
      x: 0,
      y: sliderTop,
      toJSON: () => ({})
    }));

    fireEvent.pointerDown(slider, { pointerId: 7 });
    sliderTop = 468;
    fireEvent.change(slider, { target: { value: '70' } });
    fireEvent.pointerUp(window, { pointerId: 7 });
    animationFrames.shift()?.(0);

    expect(scrollBy).toHaveBeenCalledWith({ top: 48 });
    scrollContainer.remove();
  });

  it('cancels pending resize work when unmounted', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(42);
    const cancelAnimationFrame = vi.spyOn(window, 'cancelAnimationFrame');
    const result = render(<NoteImageView {...imageProps()} />);
    const slider = result.getByRole('slider', { name: '图片缩放' });

    fireEvent.pointerDown(slider, { pointerId: 9 });
    fireEvent.change(slider, { target: { value: '72' } });
    result.unmount();

    expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
  });
});
