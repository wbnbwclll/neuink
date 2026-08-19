import { describe, expect, it } from 'vitest';

import {
  AUTO_SUBTOPICS,
  extractLabeledBody,
  parseOutlineJson,
  stripLeadingLabel
} from './orchestrator';

describe('AUTO_SUBTOPICS', () => {
  it('maps each depth to a subtopic count', () => {
    expect(AUTO_SUBTOPICS).toEqual({ quick: 2, standard: 4, deep: 6, manual: 4 });
  });
});

describe('extractLabeledBody', () => {
  it('extracts text after the requested double-backtick label', () => {
    expect(extractLabeledBody('``THINK`` 想一下\n``FINISH`` 好的，接下来研究 X', 'FINISH')).toBe(
      '好的，接下来研究 X'
    );
  });

  it('returns null when the label is absent', () => {
    expect(extractLabeledBody('只有正文', 'FINISH')).toBeNull();
  });
});

describe('stripLeadingLabel', () => {
  it('removes a leading protocol label', () => {
    expect(stripLeadingLabel('``FINISH`` 好的')).toBe('好的');
    expect(stripLeadingLabel('``TOOL`` 问一下')).toBe('问一下');
  });

  it('keeps text without a leading label untouched', () => {
    expect(stripLeadingLabel('好的，接下来研究 X')).toBe('好的，接下来研究 X');
  });
});

describe('parseOutlineJson', () => {
  it('parses the OUTLINE-labeled JSON payload', () => {
    const text = '``OUTLINE``\n{"sub_topics":[{"title":"背景","overview":"历史"},{"title":"方法"}]}';
    const items = parseOutlineJson(text, 2);
    expect(items).toEqual([
      { overview: '历史', title: '背景' },
      { overview: undefined, title: '方法' }
    ]);
  });

  it('parses a bare JSON object and trims titles', () => {
    const items = parseOutlineJson('{"sub_topics":[{"title":"  A  ","overview":""}]}', 1);
    expect(items).toEqual([{ overview: undefined, title: 'A' }]);
  });

  it('caps items at the expected count', () => {
    const items = parseOutlineJson(
      '{"sub_topics":[{"title":"1"},{"title":"2"},{"title":"3"}]}',
      2
    );
    expect(items.map((item) => item.title)).toEqual(['1', '2']);
  });

  it('falls back to a single derived item for malformed output', () => {
    const items = parseOutlineJson('没有 JSON 的输出', 4);
    expect(items).toHaveLength(1);
    expect(items[0].title.length).toBeGreaterThan(0);
  });
});
