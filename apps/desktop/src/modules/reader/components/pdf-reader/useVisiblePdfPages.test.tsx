// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useVisiblePdfPages } from './useVisiblePdfPages';

type ObserverRecord = {
  callback: IntersectionObserverCallback;
  disconnect: ReturnType<typeof vi.fn>;
  observe: ReturnType<typeof vi.fn>;
  options?: IntersectionObserverInit;
};

const observers: ObserverRecord[] = [];
const originalIntersectionObserver = globalThis.IntersectionObserver;

beforeEach(() => {
  observers.length = 0;
  globalThis.IntersectionObserver = class IntersectionObserverMock {
    readonly root = null;
    readonly rootMargin = '0px';
    readonly thresholds = [0];
    disconnect = vi.fn();
    observe = vi.fn();
    takeRecords = vi.fn(() => []);
    unobserve = vi.fn();

    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      observers.push({
        callback,
        disconnect: this.disconnect,
        observe: this.observe,
        options
      });
    }
  } as unknown as typeof IntersectionObserver;
});

afterEach(() => {
  cleanup();
  globalThis.IntersectionObserver = originalIntersectionObserver;
});

describe('useVisiblePdfPages', () => {
  it('tracks visible and nearby pages without measuring every page on scroll', () => {
    const root = document.createElement('div');
    const pageElements = Array.from({ length: 7 }, (_, pageIdx) => {
      const element = document.createElement('section');
      element.dataset.pdfPageIndex = String(pageIdx);
      root.append(element);
      return element;
    });
    const rectSpies = pageElements.map((element) =>
      vi.spyOn(element, 'getBoundingClientRect')
    );
    const scrollRef = { current: root };
    const hook = renderHook(() =>
      useVisiblePdfPages({ pageCount: pageElements.length, scrollRef })
    );

    const visibleObserver = observers.find((item) => !item.options?.rootMargin)!;
    const nearbyObserver = observers.find((item) => Boolean(item.options?.rootMargin))!;
    expect(visibleObserver.observe).toHaveBeenCalledTimes(7);
    expect(nearbyObserver.observe).toHaveBeenCalledTimes(7);

    const originalElementFromPoint = document.elementFromPoint;
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => pageElements[4]
    });
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({
      bottom: 800,
      height: 800,
      left: 0,
      right: 1000,
      top: 0,
      width: 1000,
      x: 0,
      y: 0,
      toJSON: () => ({})
    });
    act(() => root.dispatchEvent(new Event('scroll')));
    expect([...hook.result.current.visiblePageIndexes]).toEqual([4]);
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: originalElementFromPoint
    });

    act(() => {
      nearbyObserver.callback(
        [intersectionEntry(pageElements[4], true)],
        {} as IntersectionObserver
      );
      visibleObserver.callback(
        [
          intersectionEntry(pageElements[0], false),
          intersectionEntry(pageElements[4], true)
        ],
        {} as IntersectionObserver
      );
    });

    expect([...hook.result.current.visiblePageIndexes]).toEqual([4]);
    expect([...hook.result.current.renderPageIndexes].sort()).toEqual([3, 4, 5]);

    act(() => root.dispatchEvent(new Event('scroll')));
    for (const spy of rectSpies) expect(spy).not.toHaveBeenCalled();
  });
});

function intersectionEntry(target: Element, isIntersecting: boolean) {
  return { isIntersecting, target } as IntersectionObserverEntry;
}
