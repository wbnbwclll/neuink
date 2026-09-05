/** @vitest-environment jsdom */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const readPdfBytes = vi.hoisted(() => vi.fn());

vi.mock('@/shared/ipc/workspaceApi', () => ({ readPdfBytes }));

import { usePdfBytes } from './usePdfBytes';

describe('usePdfBytes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retries the same local PDF after an IPC read failure', async () => {
    readPdfBytes
      .mockRejectedValueOnce(new Error('read failed'))
      .mockResolvedValueOnce(new Uint8Array([1, 2, 3]).buffer);
    const { result } = renderHook(() => usePdfBytes('C:/workspace/paper.pdf'));

    await waitFor(() => expect(result.current.status).toBe('error'));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(readPdfBytes).toHaveBeenCalledTimes(2);
    if (result.current.status === 'ready') {
      expect([...result.current.bytes]).toEqual([1, 2, 3]);
    }
  });
});
