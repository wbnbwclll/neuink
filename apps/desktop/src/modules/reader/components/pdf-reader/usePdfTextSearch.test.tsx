/** @vitest-environment jsdom */

import { act, renderHook, waitFor } from '@testing-library/react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { describe, expect, it, vi } from 'vitest';

import {
  countPdfTextOccurrences,
  normalizePdfSearchText,
  usePdfTextSearch
} from './usePdfTextSearch';

describe('usePdfTextSearch', () => {
  it('searches normalized text across pages and starts near the visible page', async () => {
    const pages = [
      ['Alpha', 'beta', 'alpha'],
      ['Second page', 'ALPHA result']
    ];
    const pdfDocument = {
      getPage: vi.fn(async (pageNumber: number) => ({
        getTextContent: vi.fn(async () => ({
          items: pages[pageNumber - 1].map((str) => ({ str }))
        }))
      })),
      numPages: pages.length
    } as unknown as PDFDocumentProxy;
    const { result } = renderHook(() => usePdfTextSearch(pdfDocument, 1));

    act(() => result.current.setQuery(' alpha '));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.matches).toHaveLength(3);
    expect(result.current.matchCountsByPage.get(0)).toBe(2);
    expect(result.current.matchCountsByPage.get(1)).toBe(1);
    expect(result.current.activeMatch?.pageIdx).toBe(1);

    act(() => result.current.nextMatch());
    expect(result.current.activeMatch?.pageIdx).toBe(0);
    act(() => result.current.previousMatch());
    expect(result.current.activeMatch?.pageIdx).toBe(1);
  });

  it('normalizes whitespace and counts non-overlapping matches', () => {
    expect(normalizePdfSearchText('  A\n B  ')).toBe('a b');
    expect(countPdfTextOccurrences('alpha alpha alpha', 'alpha')).toBe(3);
    expect(countPdfTextOccurrences('aaaa', 'aa')).toBe(2);
  });
});
