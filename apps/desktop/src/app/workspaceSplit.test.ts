import { describe, expect, it } from 'vitest';

import {
  clampWorkspaceSplitLeftWidth,
  getWorkspaceSplitMinimums,
  getWorkspaceSplitWidthBounds,
  WORKSPACE_SPLIT_DIVIDER_WIDTH
} from './workspaceSplit';

describe('workspace split sizing', () => {
  it('preserves the standard 320px minimum when space is available', () => {
    expect(getWorkspaceSplitWidthBounds(1000)).toEqual({
      minLeftWidth: 320,
      maxLeftWidth: 670
    });
    expect(clampWorkspaceSplitLeftWidth(120, 1000)).toBe(320);
    expect(clampWorkspaceSplitLeftWidth(900, 1000)).toBe(670);
  });

  it('lets a Markdown note use a narrower pane without shrinking the reader contract', () => {
    const noteOnRight = getWorkspaceSplitMinimums(
      { kind: 'pdf', entryId: 'entry-1' },
      { kind: 'note', entryId: 'entry-1', noteId: 'note-1' }
    );
    const noteOnLeft = getWorkspaceSplitMinimums(
      { kind: 'note', entryId: 'entry-1', noteId: 'note-1' },
      { kind: 'reflow', entryId: 'entry-1' }
    );

    expect(noteOnRight).toEqual({ left: 320, right: 224 });
    expect(clampWorkspaceSplitLeftWidth(900, 1000, noteOnRight)).toBe(766);
    expect(noteOnLeft).toEqual({ left: 224, right: 320 });
    expect(clampWorkspaceSplitLeftWidth(120, 1000, noteOnLeft)).toBe(224);
  });

  it('shrinks panes proportionally instead of clipping a narrow workspace', () => {
    const containerWidth = 500;
    const minimums = { left: 224, right: 320 };
    const bounds = getWorkspaceSplitWidthBounds(containerWidth, minimums);
    const left = clampWorkspaceSplitLeftWidth(900, containerWidth, minimums);
    const right = containerWidth - WORKSPACE_SPLIT_DIVIDER_WIDTH - left;

    expect(bounds).toEqual({ minLeftWidth: 201, maxLeftWidth: 201 });
    expect(left).toBe(201);
    expect(right).toBe(289);
  });
});
