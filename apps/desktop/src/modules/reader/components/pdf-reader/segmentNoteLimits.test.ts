import { describe, expect, it } from 'vitest';

import {
  getSegmentNoteValidation,
  getSegmentNoteVisibleText,
  MAX_SEGMENT_NOTE_CHARACTERS
} from './segmentNoteLimits';

describe('segment note limits', () => {
  it('accepts text at the limit and rejects text above it', () => {
    expect(getSegmentNoteValidation('x'.repeat(MAX_SEGMENT_NOTE_CHARACTERS))).toEqual({
      length: 500,
      maxLength: 500,
      overLimit: false
    });
    expect(getSegmentNoteValidation('x'.repeat(MAX_SEGMENT_NOTE_CHARACTERS + 1))).toEqual({
      length: 501,
      maxLength: 500,
      overLimit: true
    });
  });

  it('counts Unicode code points rather than UTF-16 code units', () => {
    expect(getSegmentNoteValidation('中文').length).toBe(2);
    expect(getSegmentNoteValidation('😀').length).toBe(1);
  });

  it('counts visible text without Markdown, HTML color tags, or line breaks', () => {
    const markdown =
      '<span style="color: #da1e28">红色</span>\n\n**加粗** _斜体_ [链接](https://example.com)';

    expect(getSegmentNoteVisibleText(markdown)).toBe('红色加粗 斜体 链接');
    expect(getSegmentNoteValidation(getSegmentNoteVisibleText(markdown)).length).toBe(10);
  });

  it('does not count line breaks in visible text validation', () => {
    expect(getSegmentNoteValidation('第一行\n\n第二行')).toEqual({
      length: 6,
      maxLength: MAX_SEGMENT_NOTE_CHARACTERS,
      overLimit: false
    });
  });
});
