import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import { readReadingState, updateReadingState } from '@/shared/ipc/workspaceApi';
import { emitReadingStateUpdated } from '@/shared/lib/readingStateEvents';
import type { EntryReadingState, ReadingMode } from '@/shared/types/domain';

const IDLE_AFTER_MS = 60_000;
const FLUSH_EVERY_MS = 15_000;
const PAGE_VISIT_AFTER_MS = 2_000;

export function useReadingActivityTracker({
  enabled,
  entryId,
  mode,
  pageCount,
  scrollRef,
  visiblePageIndexes,
  workspaceRoot
}: {
  enabled: boolean;
  entryId: string;
  mode: ReadingMode;
  pageCount: number;
  scrollRef: RefObject<HTMLDivElement>;
  visiblePageIndexes: number[];
  workspaceRoot: string | null;
}) {
  const [savedState, setSavedState] = useState<EntryReadingState | null>(null);
  const activeContextRef = useRef(`${workspaceRoot ?? ''}:${entryId}`);
  const activeMsRef = useRef(0);
  const dirtyLocationRef = useRef(false);
  const lastInteractionAtRef = useRef(Date.now());
  const lastTickAtRef = useRef(Date.now());
  const pageDwellMsRef = useRef(new Map<number, number>());
  const pendingVisitedRef = useRef(new Set<number>());
  const sessionStartedRef = useRef(false);
  const visiblePagesRef = useRef(visiblePageIndexes);
  const queueRef = useRef(Promise.resolve());
  activeContextRef.current = `${workspaceRoot ?? ''}:${entryId}`;

  useEffect(() => {
    visiblePagesRef.current = visiblePageIndexes;
    if (visiblePageIndexes.length > 0) {
      dirtyLocationRef.current = true;
    }
  }, [visiblePageIndexes]);

  useEffect(() => {
    setSavedState(null);
    activeMsRef.current = 0;
    dirtyLocationRef.current = false;
    pageDwellMsRef.current.clear();
    pendingVisitedRef.current.clear();
    sessionStartedRef.current = false;
    lastInteractionAtRef.current = Date.now();
    lastTickAtRef.current = Date.now();
    if (!workspaceRoot) {
      return;
    }
    const contextKey = `${workspaceRoot}:${entryId}`;
    let cancelled = false;
    void readReadingState(workspaceRoot, entryId)
      .then((state) => {
        if (!cancelled && activeContextRef.current === contextKey) {
          setSavedState(state);
          emitReadingStateUpdated(state);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [entryId, workspaceRoot]);

  const flush = useCallback(() => {
    if (!workspaceRoot || !enabled || pageCount <= 0) {
      return;
    }
    const activeMs = Math.round(activeMsRef.current);
    const visitedPages = [...pendingVisitedRef.current];
    const currentPageIdx = visiblePagesRef.current[0] ?? null;
    if (activeMs <= 0 && visitedPages.length === 0 && !dirtyLocationRef.current) {
      return;
    }
    activeMsRef.current = 0;
    pendingVisitedRef.current.clear();
    dirtyLocationRef.current = false;
    const sessionStart = !sessionStartedRef.current;
    sessionStartedRef.current = true;
    const localDate = formatLocalDate(new Date());
    const contextKey = `${workspaceRoot}:${entryId}`;

    queueRef.current = queueRef.current
      .then(() =>
        updateReadingState(workspaceRoot, entryId, {
          mode,
          current_page_idx: currentPageIdx,
          page_count: pageCount,
          visited_pages: visitedPages,
          active_ms_delta: activeMs,
          session_start: sessionStart,
          local_date: localDate
        })
      )
      .then((state) => {
        if (activeContextRef.current === contextKey) {
          setSavedState(state);
          emitReadingStateUpdated(state);
        }
      })
      .catch(() => {
        if (activeContextRef.current === contextKey) {
          activeMsRef.current += activeMs;
          visitedPages.forEach((pageIdx) => pendingVisitedRef.current.add(pageIdx));
          dirtyLocationRef.current = true;
          sessionStartedRef.current = false;
        }
      });
  }, [enabled, entryId, mode, pageCount, workspaceRoot]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const markInteraction = () => {
      lastInteractionAtRef.current = Date.now();
    };
    const container = scrollRef.current;
    container?.addEventListener('scroll', markInteraction, { passive: true });
    window.addEventListener('keydown', markInteraction);
    window.addEventListener('pointerdown', markInteraction);
    window.addEventListener('wheel', markInteraction, { passive: true });

    const tick = window.setInterval(() => {
      const now = Date.now();
      const elapsed = Math.min(now - lastTickAtRef.current, 2_000);
      lastTickAtRef.current = now;
      const active =
        document.visibilityState === 'visible' &&
        document.hasFocus() &&
        now - lastInteractionAtRef.current <= IDLE_AFTER_MS;
      if (!active || visiblePagesRef.current.length === 0) {
        return;
      }
      activeMsRef.current += elapsed;
      for (const pageIdx of visiblePagesRef.current) {
        const dwell = (pageDwellMsRef.current.get(pageIdx) ?? 0) + elapsed;
        pageDwellMsRef.current.set(pageIdx, dwell);
        if (dwell >= PAGE_VISIT_AFTER_MS) {
          pendingVisitedRef.current.add(pageIdx);
        }
      }
    }, 1_000);
    const flushTimer = window.setInterval(flush, FLUSH_EVERY_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flush();
      } else {
        markInteraction();
        lastTickAtRef.current = Date.now();
      }
    };
    const handleBlur = () => flush();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.clearInterval(tick);
      window.clearInterval(flushTimer);
      container?.removeEventListener('scroll', markInteraction);
      window.removeEventListener('keydown', markInteraction);
      window.removeEventListener('pointerdown', markInteraction);
      window.removeEventListener('wheel', markInteraction);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      flush();
    };
  }, [enabled, flush, scrollRef]);

  return savedState;
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
