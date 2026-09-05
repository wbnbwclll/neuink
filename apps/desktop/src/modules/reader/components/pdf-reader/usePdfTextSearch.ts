import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type PdfTextSearchMatch = {
  occurrenceIndex: number;
  pageIdx: number;
};

type PdfTextSearchState = {
  activeMatchIndex: number;
  error: string | null;
  matches: PdfTextSearchMatch[];
  matchCountsByPage: Map<number, number>;
  processedPageCount: number;
  status: 'idle' | 'searching' | 'ready' | 'error';
};

const EMPTY_SEARCH_STATE: PdfTextSearchState = {
  activeMatchIndex: -1,
  error: null,
  matches: [],
  matchCountsByPage: new Map(),
  processedPageCount: 0,
  status: 'idle'
};

export function usePdfTextSearch(
  pdfDocument: PDFDocumentProxy | null,
  currentPageIdx: number
) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<PdfTextSearchState>(EMPTY_SEARCH_STATE);
  const anchorPageRef = useRef(currentPageIdx);
  const pageTextCacheRef = useRef<{
    document: PDFDocumentProxy | null;
    pages: Map<number, string>;
  }>({ document: null, pages: new Map() });

  anchorPageRef.current = currentPageIdx;

  useEffect(() => {
    if (pageTextCacheRef.current.document !== pdfDocument) {
      pageTextCacheRef.current = { document: pdfDocument, pages: new Map() };
    }
    setState(EMPTY_SEARCH_STATE);
  }, [pdfDocument]);

  useEffect(() => {
    const normalizedQuery = normalizePdfSearchText(query.trim());
    if (!pdfDocument || !normalizedQuery) {
      setState(EMPTY_SEARCH_STATE);
      return undefined;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      void (async () => {
        setState({
          ...EMPTY_SEARCH_STATE,
          status: 'searching'
        });
        try {
          const matches: PdfTextSearchMatch[] = [];
          const matchCountsByPage = new Map<number, number>();
          const cache = pageTextCacheRef.current;

          for (let pageIdx = 0; pageIdx < pdfDocument.numPages; pageIdx += 1) {
            if (cancelled) return;
            let pageText = cache.pages.get(pageIdx);
            if (pageText === undefined) {
              const page = await pdfDocument.getPage(pageIdx + 1);
              const textContent = await page.getTextContent();
              pageText = normalizePdfSearchText(
                textContent.items
                  .map((item) => ('str' in item ? item.str : ''))
                  .join(' ')
              );
              cache.pages.set(pageIdx, pageText);
            }

            const occurrenceCount = countPdfTextOccurrences(pageText, normalizedQuery);
            if (occurrenceCount > 0) {
              matchCountsByPage.set(pageIdx, occurrenceCount);
              for (let occurrenceIndex = 0; occurrenceIndex < occurrenceCount; occurrenceIndex += 1) {
                matches.push({ occurrenceIndex, pageIdx });
              }
            }

            if (!cancelled && (pageIdx + 1) % 8 === 0) {
              setState((current) => ({
                ...current,
                processedPageCount: pageIdx + 1,
                status: 'searching'
              }));
            }
          }

          if (cancelled) return;
          const nearestMatchIndex = matches.findIndex(
            (match) => match.pageIdx >= anchorPageRef.current
          );
          setState({
            activeMatchIndex: matches.length === 0
              ? -1
              : nearestMatchIndex >= 0
                ? nearestMatchIndex
                : 0,
            error: null,
            matches,
            matchCountsByPage,
            processedPageCount: pdfDocument.numPages,
            status: 'ready'
          });
        } catch (caught) {
          if (!cancelled) {
            setState({
              ...EMPTY_SEARCH_STATE,
              error: caught instanceof Error ? caught.message : String(caught),
              status: 'error'
            });
          }
        }
      })();
    }, 160);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [pdfDocument, query]);

  const nextMatch = useCallback(() => {
    setState((current) => {
      if (current.matches.length === 0) return current;
      return {
        ...current,
        activeMatchIndex: (current.activeMatchIndex + 1) % current.matches.length
      };
    });
  }, []);

  const previousMatch = useCallback(() => {
    setState((current) => {
      if (current.matches.length === 0) return current;
      const currentIndex = current.activeMatchIndex < 0 ? 0 : current.activeMatchIndex;
      return {
        ...current,
        activeMatchIndex:
          (currentIndex - 1 + current.matches.length) % current.matches.length
      };
    });
  }, []);

  const activeMatch = useMemo(
    () => state.matches[state.activeMatchIndex] ?? null,
    [state.activeMatchIndex, state.matches]
  );

  return {
    ...state,
    activeMatch,
    nextMatch,
    previousMatch,
    query,
    setQuery
  };
}

export function normalizePdfSearchText(value: string) {
  return value.replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

export function countPdfTextOccurrences(text: string, query: string) {
  if (!query) return 0;
  let count = 0;
  let fromIndex = 0;
  while (fromIndex <= text.length - query.length) {
    const matchIndex = text.indexOf(query, fromIndex);
    if (matchIndex < 0) break;
    count += 1;
    fromIndex = matchIndex + Math.max(1, query.length);
  }
  return count;
}
