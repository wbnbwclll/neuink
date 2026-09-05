import { afterEach, describe, expect, it, vi } from 'vitest';

import { PdfRenderQueue } from './pdfRenderQueue';

afterEach(() => {
  vi.useRealTimers();
});

describe('PdfRenderQueue', () => {
  it('runs heavy PDF jobs serially', async () => {
    const queue = new PdfRenderQueue();
    const first = deferred<void>();
    const starts: string[] = [];

    queue.schedule({
      kind: 'visible-raster',
      run: async () => {
        starts.push('first');
        await first.promise;
      }
    });
    queue.schedule({
      kind: 'visible-raster',
      run: async () => {
        starts.push('second');
      }
    });

    expect(starts).toEqual(['first']);
    first.resolve();
    await flushMicrotasks();
    expect(starts).toEqual(['first', 'second']);
  });

  it('preempts text work for a visible page and retries the text job', async () => {
    const queue = new PdfRenderQueue();
    const starts: string[] = [];

    queue.schedule({
      kind: 'text-layer',
      retryOnPreempt: true,
      run: async (signal) => {
        starts.push('text');
        if (starts.filter((value) => value === 'text').length === 1) {
          await waitForAbort(signal);
        }
      }
    });
    queue.schedule({
      kind: 'visible-raster',
      run: async () => {
        starts.push('visible');
      }
    });

    await flushMicrotasks();
    expect(starts).toEqual(['text', 'visible', 'text']);
  });

  it('promotes an active preload without restarting it', async () => {
    const queue = new PdfRenderQueue();
    const render = deferred<void>();
    const run = vi.fn(async () => render.promise);

    const handle = queue.schedule({ kind: 'preload-raster', run });
    handle.setKind('visible-raster');
    render.resolve();
    await flushMicrotasks();

    expect(run).toHaveBeenCalledOnce();
  });

  it('pauses retryable background work until interaction becomes idle', async () => {
    vi.useFakeTimers();
    const queue = new PdfRenderQueue();
    const run = vi.fn(async (signal: AbortSignal) => {
      if (run.mock.calls.length === 1) await waitForAbort(signal);
    });

    queue.schedule({ kind: 'text-layer', retryOnPreempt: true, run });
    queue.notifyInteraction();
    await flushMicrotasks();
    expect(run).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(320);
    expect(run).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('demotes visible raster work when scrolling so it cannot block the new page', async () => {
    vi.useFakeTimers();
    const queue = new PdfRenderQueue();
    const run = vi.fn(async (signal: AbortSignal) => {
      if (run.mock.calls.length === 1) await waitForAbort(signal);
    });

    queue.schedule({ kind: 'visible-raster', retryOnPreempt: true, run });
    queue.notifyInteraction({ abortVisible: true });
    await flushMicrotasks();
    expect(run).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(321);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('never starts a queued job after cancellation', async () => {
    const queue = new PdfRenderQueue();
    const first = deferred<void>();
    const queuedRun = vi.fn(async () => undefined);

    queue.schedule({
      kind: 'visible-raster',
      run: async () => first.promise
    });
    const queued = queue.schedule({
      kind: 'preload-raster',
      run: queuedRun
    });
    queued.cancel();
    first.resolve();
    await flushMicrotasks();

    expect(queuedRun).not.toHaveBeenCalled();
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

function waitForAbort(signal: AbortSignal) {
  if (signal.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    signal.addEventListener('abort', () => resolve(), { once: true });
  });
}

async function flushMicrotasks() {
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve();
  }
}
