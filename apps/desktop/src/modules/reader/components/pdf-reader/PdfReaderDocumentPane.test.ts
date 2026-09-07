import { describe, expect, it } from 'vitest';

import { centeredPdfScrollLeft } from './pdfViewportLayout';

describe('centeredPdfScrollLeft', () => {
  it('keeps a fitted PDF at the horizontal origin', () => {
    expect(centeredPdfScrollLeft(480, 480)).toBe(0);
    expect(centeredPdfScrollLeft(480.5, 480)).toBe(0);
  });

  it('centers an enlarged PDF inside its scroll viewport', () => {
    expect(centeredPdfScrollLeft(960, 480)).toBe(240);
  });
});
