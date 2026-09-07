// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ToastInput } from '@/shared/hooks/useToast';
import type { AnnotationId } from '@/shared/types/domain';

import { usePdfAnnotationActions } from './usePdfAnnotationActions';

const toastMocks = vi.hoisted(() => ({
  dismiss: vi.fn(),
  notify: vi.fn((_toast: unknown) => 'toast-1')
}));

vi.mock('@/shared/hooks/useToast', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/shared/hooks/useToast')>();
  return {
    ...original,
    useToast: () => toastMocks
  };
});

describe('usePdfAnnotationActions', () => {
  beforeEach(() => {
    toastMocks.dismiss.mockClear();
    toastMocks.notify.mockClear();
  });

  it('cancels a pending deletion when its notification is dismissed', () => {
    const annotationId = 'annotation-1' as AnnotationId;
    const { result } = renderActions();

    act(() => result.current.scheduleDelete(annotationId));
    const notification = toastMocks.notify.mock.calls[0]?.[0] as ToastInput;
    act(() => notification.onDismiss?.());
    act(() => result.current.scheduleDelete(annotationId));

    expect(toastMocks.notify).toHaveBeenCalledTimes(2);
  });

  it('deletes the annotation when the notification expires', async () => {
    const annotationId = 'annotation-1' as AnnotationId;
    const onDeleteAnnotation = vi.fn().mockResolvedValue([]);
    const { result } = renderActions(onDeleteAnnotation);

    act(() => result.current.setFocusId(annotationId));
    act(() => result.current.scheduleDelete(annotationId));
    const notification = toastMocks.notify.mock.calls[0]?.[0] as ToastInput;
    act(() => notification.onExpire?.());

    await waitFor(() => {
      expect(onDeleteAnnotation).toHaveBeenCalledWith('entry-1', annotationId);
      expect(result.current.focusId).toBeNull();
    });
  });
});

function renderActions(onDeleteAnnotation = vi.fn().mockResolvedValue([])) {
  return renderHook(() =>
    usePdfAnnotationActions({
      annotations: [],
      entryId: 'entry-1',
      onDeleteAnnotation,
      onSaveAnnotation: vi.fn().mockResolvedValue([]),
      setAnnotations: vi.fn()
    })
  );
}
