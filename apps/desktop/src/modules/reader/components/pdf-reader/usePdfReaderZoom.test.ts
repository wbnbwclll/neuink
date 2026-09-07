import { describe, expect, it } from 'vitest';

import { resolvePdfPageWidth } from './usePdfReaderZoom';

describe('resolvePdfPageWidth', () => {
  it('fits a single page to a narrow viewport at 100% zoom', () => {
    expect(resolvePdfPageWidth({
      pageDisplayMode: 'single',
      viewportWidth: 320,
      zoom: 1
    })).toBe(224);
  });

  it('fits both pages to the available width in dual-page mode', () => {
    expect(resolvePdfPageWidth({
      pageDisplayMode: 'dual',
      viewportWidth: 320,
      zoom: 1
    })).toBe(104);
  });

  it('only creates horizontal overflow when the reader is zoomed above fit width', () => {
    expect(resolvePdfPageWidth({
      pageDisplayMode: 'single',
      viewportWidth: 320,
      zoom: 1.2
    })).toBeCloseTo(268.8);
  });
});
