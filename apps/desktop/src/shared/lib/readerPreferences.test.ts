// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';

import { persistReaderPreferences, readStoredReaderPreferences } from './readerPreferences';

beforeEach(() => window.localStorage.clear());

describe('reader preferences', () => {
  it('keeps automatic selection translation disabled for existing users', () => {
    window.localStorage.setItem(
      'neuink.reader.preferences',
      JSON.stringify({ hoverPreviewEnabled: false })
    );

    expect(readStoredReaderPreferences().autoTranslateTextSelection).toBe(false);
  });

  it('persists automatic selection translation', () => {
    const preferences = readStoredReaderPreferences();
    persistReaderPreferences({ ...preferences, autoTranslateTextSelection: true });

    expect(readStoredReaderPreferences().autoTranslateTextSelection).toBe(true);
  });

  it('defaults pageDisplayMode to single', () => {
    expect(readStoredReaderPreferences().pageDisplayMode).toBe('single');
  });

  it('persists pageDisplayMode', () => {
    const preferences = readStoredReaderPreferences();
    persistReaderPreferences({ ...preferences, pageDisplayMode: 'dual' });

    expect(readStoredReaderPreferences().pageDisplayMode).toBe('dual');
  });

  it('rejects invalid pageDisplayMode values', () => {
    window.localStorage.setItem(
      'neuink.reader.preferences',
      JSON.stringify({ pageDisplayMode: 'triple' })
    );

    expect(readStoredReaderPreferences().pageDisplayMode).toBe('single');
  });

  it('normalizes pageDisplayMode from stored data', () => {
    window.localStorage.setItem(
      'neuink.reader.preferences',
      JSON.stringify({ pageDisplayMode: 'dual' })
    );

    expect(readStoredReaderPreferences().pageDisplayMode).toBe('dual');
  });
});
