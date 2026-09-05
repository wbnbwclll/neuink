import { useCallback, useRef } from 'react';

import type { SourceSegment } from '@/shared/types/domain';

export function useGuardedSegmentAction(action: (segment: SourceSegment) => void) {
  const actionRef = useRef(action);
  actionRef.current = action;

  return useCallback((segment: SourceSegment) => {
    actionRef.current(segment);
  }, []);
}
