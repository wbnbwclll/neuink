import { describe, expect, it } from 'vitest';

import type { ConversationSourceLink } from '@/shared/ipc/assistantApi';

import {
  blockNumberFromBlockId,
  CitationManager,
  citationSortKey,
  sortCitationIds
} from './citationManager';

function localSource(entryId: string, segmentUid: string): ConversationSourceLink {
  return {
    entry_id: entryId,
    entry_title: `Entry ${entryId}`,
    page_idx: 0,
    quote: 'quote',
    segment_uid: segmentUid
  };
}

function sciverseSource(docId: string): ConversationSourceLink {
  return {
    chunk_id: null,
    doc_id: docId,
    offset: null,
    page_no: 4,
    provider: 'sciverse',
    quote: 'paper quote',
    title: `Paper ${docId}`
  };
}

describe('CitationManager.generateResearchCitationId', () => {
  it('numbers citations per block with zero-padded sequence', () => {
    const citations = new CitationManager();
    expect(citations.generateResearchCitationId('block_1')).toBe('CIT-1-01');
    expect(citations.generateResearchCitationId('block_1')).toBe('CIT-1-02');
    expect(citations.generateResearchCitationId('block_2')).toBe('CIT-2-01');
  });
});

describe('CitationManager.addCitation / toSourceLinks', () => {
  it('deduplicates the same source across citations', () => {
    const citations = new CitationManager();
    const source = localSource('e1', 's1');
    citations.addCitation({
      citationId: 'CIT-1-01',
      query: 'q1',
      sources: [source],
      summary: 's1',
      toolName: 'search_segments'
    });
    citations.addCitation({
      citationId: 'CIT-1-02',
      query: 'q2',
      sources: [source],
      summary: 's2',
      toolName: 'read_segment_content'
    });
    expect(citations.getCitationCount()).toBe(2);
    expect(citations.toSourceLinks()).toHaveLength(1);
  });

  it('keeps sciverse and local sources distinct', () => {
    const citations = new CitationManager();
    citations.addCitation({
      citationId: 'CIT-1-01',
      query: 'q1',
      sources: [sciverseSource('d1')],
      summary: 's1',
      toolName: 'search_sciverse_evidence'
    });
    citations.addCitation({
      citationId: 'CIT-1-02',
      query: 'q2',
      sources: [localSource('e1', 's1')],
      summary: 's2',
      toolName: 'search_segments'
    });
    expect(citations.toSourceLinks()).toHaveLength(2);
  });
});

describe('blockNumberFromBlockId', () => {
  it('extracts the trailing numeric block number', () => {
    expect(blockNumberFromBlockId('block_1')).toBe(1);
    expect(blockNumberFromBlockId('block_12')).toBe(12);
  });

  it('returns 0 for malformed ids', () => {
    expect(blockNumberFromBlockId('block_x')).toBe(0);
    expect(blockNumberFromBlockId('')).toBe(0);
  });
});

describe('citationSortKey / sortCitationIds', () => {
  it('orders PLAN ids before CIT ids, and blocks/sequences numerically', () => {
    expect(citationSortKey('PLAN-3')).toEqual([0, 0, 3]);
    expect(citationSortKey('CIT-2-03')).toEqual([1, 2, 3]);
    expect(citationSortKey('CIT-1-10')).toEqual([1, 1, 10]);
    expect(citationSortKey('OTHER')).toEqual([999, 999, 999]);
  });

  it('sorts a mixed set deterministically', () => {
    expect(sortCitationIds(['CIT-2-01', 'PLAN-1', 'CIT-1-10', 'CIT-1-02'])).toEqual([
      'PLAN-1',
      'CIT-1-02',
      'CIT-1-10',
      'CIT-2-01'
    ]);
  });
});
