import { describe, expect, it } from 'vitest';

import type { ConversationSourceLink } from '@/shared/ipc/assistantApi';

import { CitationManager } from './citationManager';
import {
  buildReportSections,
  linkifyCitations,
  referenceSourceLabel,
  renderReferenceList,
  repairSectionCoverage
} from './reportWriter';
import type { ResearchedBlock } from './types';

function localSource(entryId: string, segmentUid: string): ConversationSourceLink {
  return {
    entry_id: entryId,
    entry_title: `Entry ${entryId}`,
    page_idx: 1,
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

function withCitations(...records: Array<{ citationId: string; sources: ConversationSourceLink[] }>) {
  const citations = new CitationManager();
  for (const record of records) {
    citations.addCitation({
      citationId: record.citationId,
      query: 'q',
      sources: record.sources,
      summary: 's',
      toolName: 'search_segments'
    });
  }
  return citations;
}

describe('linkifyCitations', () => {
  it('renumbers CIT markers to S markers by first appearance', () => {
    const citations = withCitations(
      { citationId: 'CIT-1-01', sources: [localSource('e1', 's1')] },
      { citationId: 'CIT-1-02', sources: [localSource('e1', 's2')] }
    );
    const linked = linkifyCitations('先说 [CIT-1-02]，再提 [CIT-1-01]。', citations);
    expect(linked.text).toBe('先说 [S1]，再提 [S2]。');
    expect(linked.sourceLinks).toEqual([localSource('e1', 's2'), localSource('e1', 's1')]);
  });

  it('maps repeated markers to the same S number', () => {
    const citations = withCitations({
      citationId: 'CIT-1-01',
      sources: [localSource('e1', 's1')]
    });
    const linked = linkifyCitations('[CIT-1-01] and [CIT-1-01]', citations);
    expect(linked.text).toBe('[S1] and [S1]');
    expect(linked.sourceLinks).toHaveLength(1);
  });

  it('deduplicates the same source across different citations', () => {
    const source = localSource('e1', 's1');
    const citations = withCitations(
      { citationId: 'CIT-1-01', sources: [source] },
      { citationId: 'CIT-2-01', sources: [source] }
    );
    const linked = linkifyCitations('[CIT-1-01] 与 [CIT-2-01]', citations);
    expect(linked.text).toBe('[S1] 与 [S1]');
    expect(linked.sourceLinks).toHaveLength(1);
  });

  it('drops unknown citation markers', () => {
    const citations = withCitations({
      citationId: 'CIT-1-01',
      sources: [localSource('e1', 's1')]
    });
    // 未知标记（模型幻觉）被移除，不留下悬空引用；残留的空白为可接受的装饰噪音。
    expect(linkifyCitations('幻影 [CIT-9-99] 引用', citations).text).toBe('幻影  引用');
  });
});

describe('referenceSourceLabel / renderReferenceList', () => {
  it('labels local and sciverse sources distinctly', () => {
    expect(referenceSourceLabel(localSource('e1', 's1'))).toBe('Entry e1, p.2');
    expect(referenceSourceLabel(sciverseSource('d1'))).toBe('Paper d1, Sciverse, p.4');
  });

  it('renders a numbered list aligned with S markers', () => {
    const list = renderReferenceList([localSource('e1', 's1'), sciverseSource('d1')]);
    expect(list).toBe('[S1] Entry e1, p.2\n[S2] Paper d1, Sciverse, p.4');
  });

  it('falls back gracefully when there are no sources', () => {
    expect(renderReferenceList([])).toContain('未收集到');
  });
});

describe('buildReportSections', () => {
  const block: ResearchedBlock = {
    block: {
      blockId: 'block_1',
      iterationCount: 2,
      overview: 'O',
      status: 'completed',
      subTopic: '背景',
      toolTraces: []
    },
    knowledge: '知识正文'
  };

  it('derives one section plan per researched block', () => {
    expect(buildReportSections([block])).toEqual([
      { blockIds: ['block_1'], id: 'block_1', intent: 'O', title: '背景' }
    ]);
  });
});

describe('repairSectionCoverage', () => {
  const sections = [
    { blockIds: [] as string[], id: 'a', intent: '', title: '背景' },
    { blockIds: [] as string[], id: 'b', intent: '', title: '方法' }
  ];

  it('reports nothing missing when every section header is present', () => {
    const report = '# 报告\n\n## 1. 背景\n\n正文\n\n## 2. 方法\n\n正文';
    const { missing, repaired } = repairSectionCoverage(report, sections);
    expect(missing).toEqual([]);
    expect(repaired).toBe(report);
  });

  it('flags missing sections and appends placeholders', () => {
    const report = '# 报告\n\n## 1. 背景\n\n正文';
    const { missing, repaired } = repairSectionCoverage(report, sections);
    expect(missing.map((section) => section.title)).toEqual(['方法']);
    expect(repaired).toContain('## 方法');
  });
});
