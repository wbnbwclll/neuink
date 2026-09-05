/** @vitest-environment jsdom */

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SegmentRailLayout } from './SegmentRailLayout';

describe('SegmentRailLayout', () => {
  afterEach(cleanup);

  it('uses a shrinkable explicit grid track for the reader viewport', () => {
    const view = render(
      <SegmentRailLayout rail={<div>rail</div>}>
        <div>document</div>
      </SegmentRailLayout>
    );
    const layout = view.container.firstElementChild as HTMLElement;

    expect(layout.style.gridTemplateColumns).toBe('minmax(0, 1fr)');
    expect(layout.style.gridTemplateRows).toBe('minmax(0, 1fr)');
    expect(layout.classList.contains('size-full')).toBe(true);
  });
});
