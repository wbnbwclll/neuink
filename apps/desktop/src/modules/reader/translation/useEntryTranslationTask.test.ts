import { describe, expect, it } from 'vitest';

import { normalizeTranslationJobMessage } from './useEntryTranslationTask';

describe('normalizeTranslationJobMessage', () => {
  it('keeps running action stable and preserves the latest received count', () => {
    expect(normalizeTranslationJobMessage('processing', '第 2/8 批翻译中')).toBe('正在翻译');
    expect(normalizeTranslationJobMessage('processing', '正在翻译 · 已接收 120 字')).toBe(
      '正在翻译 · 已接收 120 字'
    );
    expect(
      normalizeTranslationJobMessage('processing', '第 1/8 批翻译中', '正在翻译 · 已接收 120 字')
    ).toBe('正在翻译 · 已接收 120 字');
    expect(
      normalizeTranslationJobMessage('processing', '正在翻译 · 已接收 80 字', '正在翻译 · 已接收 120 字')
    ).toBe('正在翻译 · 已接收 120 字');
    expect(
      normalizeTranslationJobMessage('processing', '正在翻译 · 已接收 160 字', '正在翻译 · 已接收 120 字')
    ).toBe('正在翻译 · 已接收 160 字');
  });

  it('keeps terminal messages unchanged', () => {
    expect(normalizeTranslationJobMessage('succeeded', '翻译完成')).toBe('翻译完成');
  });
});
