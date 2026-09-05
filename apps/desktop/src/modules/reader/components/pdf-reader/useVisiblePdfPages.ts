import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

import { notifyPdfInteraction } from './pdfRenderQueue';

const PAGE_RENDER_OVERSCAN = 1;
const PAGE_RENDER_PRELOAD_PX = 600;

type PdfPageVisibility = {
  renderPageIndexes: Set<number>;
  visiblePageIndexes: Set<number>;
};

export function useVisiblePdfPages({
  pageCount,
  scrollRef
}: {
  pageCount: number;
  scrollRef: RefObject<HTMLDivElement>;
}) {
  const [visibility, setVisibility] = useState<PdfPageVisibility>(() =>
    initialVisibility(pageCount)
  );

  useEffect(() => {
    setVisibility(initialVisibility(pageCount));
  }, [pageCount]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || pageCount === 0) return undefined;

    const visiblePages = new Set<number>();
    const nearbyPages = new Set<number>();
    const commitVisibility = () => {
      setVisibility((current) => {
        const nextVisible = visiblePages.size > 0
          ? new Set(visiblePages)
          : current.visiblePageIndexes;
        const nextRender = withPageOverscan(
          nearbyPages.size > 0 ? nearbyPages : nextVisible,
          pageCount
        );
        return sameSet(current.visiblePageIndexes, nextVisible) &&
          sameSet(current.renderPageIndexes, nextRender)
          ? current
          : {
              renderPageIndexes: nextRender,
              visiblePageIndexes: nextVisible
            };
      });
    };
    const updateEntries = (target: Set<number>, entries: IntersectionObserverEntry[]) => {
      for (const entry of entries) {
        const pageIdx = Number((entry.target as HTMLElement).dataset.pdfPageIndex);
        if (!Number.isInteger(pageIdx)) continue;
        if (entry.isIntersecting) target.add(pageIdx);
        else target.delete(pageIdx);
      }
      commitVisibility();
    };

    const updateVisiblePageFromScrollPosition = () => {
      if (typeof document.elementFromPoint !== 'function') return null;
      const rootRect = root.getBoundingClientRect();
      if (rootRect.width <= 0 || rootRect.height <= 0) return null;

      const pageIndexes = new Set<number>();
      for (const ratio of [0.35, 0.5, 0.65]) {
        const element = document.elementFromPoint(
          rootRect.left + rootRect.width / 2,
          rootRect.top + rootRect.height * ratio
        );
        const page = element?.closest<HTMLElement>('[data-pdf-page-index]');
        if (!page || !root.contains(page)) continue;
        const pageIdx = Number(page.dataset.pdfPageIndex);
        if (Number.isInteger(pageIdx)) pageIndexes.add(pageIdx);
      }

      if (pageIndexes.size === 0) return null;
      const foundNewPage = [...pageIndexes].some((pageIdx) => !visiblePages.has(pageIdx));
      for (const pageIdx of pageIndexes) {
        visiblePages.add(pageIdx);
        nearbyPages.add(pageIdx);
      }
      commitVisibility();
      return foundNewPage;
    };

    const visibleObserver = new IntersectionObserver(
      (entries) => updateEntries(visiblePages, entries),
      { root }
    );
    const nearbyObserver = new IntersectionObserver(
      (entries) => updateEntries(nearbyPages, entries),
      { root, rootMargin: `${PAGE_RENDER_PRELOAD_PX}px 0px` }
    );
    const pageElements = root.querySelectorAll<HTMLElement>('[data-pdf-page-index]');
    for (const element of pageElements) {
      visibleObserver.observe(element);
      nearbyObserver.observe(element);
    }

    const handleScroll = () => {
      const pageChanged = updateVisiblePageFromScrollPosition();
      notifyPdfInteraction({
        abortVisible: pageChanged !== false,
        preservePreload: true
      });
    };
    root.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      visibleObserver.disconnect();
      nearbyObserver.disconnect();
      root.removeEventListener('scroll', handleScroll);
    };
  }, [pageCount, scrollRef]);

  return visibility;
}

function initialVisibility(pageCount: number): PdfPageVisibility {
  const visiblePageIndexes = pageCount > 0 ? new Set([0]) : new Set<number>();
  return {
    renderPageIndexes: withPageOverscan(visiblePageIndexes, pageCount),
    visiblePageIndexes
  };
}

function withPageOverscan(source: Set<number>, pageCount: number) {
  if (pageCount <= 0) return new Set<number>();
  const visible = source.size > 0 ? source : new Set([0]);
  const next = new Set<number>();
  for (const pageIdx of visible) {
    for (
      let index = Math.max(0, pageIdx - PAGE_RENDER_OVERSCAN);
      index <= Math.min(pageCount - 1, pageIdx + PAGE_RENDER_OVERSCAN);
      index += 1
    ) {
      next.add(index);
    }
  }
  return next;
}

function sameSet(left: Set<number>, right: Set<number>) {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}
