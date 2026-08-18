// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SourceSegment } from '@/shared/types/domain';

import { useGuardedSegmentAction } from './useGuardedSegmentAction';

describe('useGuardedSegmentAction', () => {
  it('runs a segment action in the pointer event turn', () => {
    const action = vi.fn();
    const segment = { uid: 'segment-1' } as SourceSegment;
    const { result } = renderHook(() => useGuardedSegmentAction(action));

    act(() => result.current(segment));

    expect(action).toHaveBeenCalledOnce();
    expect(action).toHaveBeenCalledWith(segment);
  });

  it('does not swallow a quick follow-up action for the same segment', () => {
    const action = vi.fn();
    const segment = { uid: 'segment-1' } as SourceSegment;
    const { result } = renderHook(() => useGuardedSegmentAction(action));

    act(() => {
      result.current(segment);
      result.current(segment);
    });

    expect(action).toHaveBeenCalledTimes(2);
  });
});
