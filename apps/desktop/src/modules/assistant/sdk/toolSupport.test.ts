import { describe, expect, it } from 'vitest';

import {
  formatReadWebPageOutput,
  formatSciverseSearchOutput,
  formatWebSearchOutput,
  applyMarkdownPatchPreview,
  markdownPatchOperations,
  noteProposalAction,
  noteProposalInputSchema,
  normalizeToolInput,
  prependMarkdownPreview,
  sourcesFromMarkers
} from './toolSupport';

describe('prepend note proposals', () => {
  it('accepts prepend as a model-visible proposal action', () => {
    const schema = noteProposalInputSchema();
    const action = schema.properties?.action as { enum?: unknown[] };

    expect(action.enum).toContain('prepend');
    expect(noteProposalAction('prepend', {
      currentNote: null,
      hasPlannedMarkdownNote: true,
      targetKind: 'markdown_note'
    })).toBe('prepend');
  });

  it('places generated Markdown before the existing note', () => {
    expect(prependMarkdownPreview('# Existing\n\nBody\n', '# New\n')).toBe(
      '# New\n\n# Existing\n\nBody\n'
    );
  });
});

describe('line-precise Markdown patches', () => {
  it('replaces, inserts, and deletes only the addressed logical lines', () => {
    const replaced = applyMarkdownPatchPreview('# Title\nfirst\nsecond\nlast\n', [{
      endLine: 3,
      expectedText: 'first\nsecond',
      newText: 'updated',
      startLine: 2,
      type: 'replace_lines'
    }]);
    expect(replaced).toBe('# Title\nupdated\nlast\n');

    const inserted = applyMarkdownPatchPreview(replaced, [{
      expectedText: 'updated', line: 2, position: 'after', text: 'added', type: 'insert_lines'
    }]);
    expect(inserted).toBe('# Title\nupdated\nadded\nlast\n');

    expect(applyMarkdownPatchPreview(inserted, [{
      endLine: 3, expectedText: 'added', startLine: 3, type: 'delete_lines'
    }])).toBe('# Title\nupdated\nlast\n');
  });

  it('rejects a stale expected line before preview or apply', () => {
    expect(() => applyMarkdownPatchPreview('# Title\nchanged\n', [{
      endLine: 2, expectedText: 'old', startLine: 2, type: 'delete_lines'
    }])).toThrow(/expected_text/);
  });

  it('parses model line coordinates into the typed patch contract', () => {
    expect(markdownPatchOperations([{
      end_line: 4,
      expected_text: 'old',
      new_text: 'new',
      start_line: 4,
      type: 'replace_lines'
    }])).toEqual([{
      endLine: 4,
      expectedText: 'old',
      newText: 'new',
      startLine: 4,
      type: 'replace_lines'
    }]);
  });
});

describe('Sciverse assistant tools', () => {
  it('normalizes bounded search input and preserves remote source identifiers', () => {
    expect(normalizeToolInput('search_sciverse_evidence', {
      query: 'graphene battery',
      sub_queries: 99,
      top_k: 99
    }, {
      root: 'workspace',
      scope: { entry_ids: [], entry_titles: [], tag_ids: [], tag_names: [] }
    })).toEqual({
      query: 'graphene battery',
      sub_queries: 4,
      top_k: 20
    });

    const sources: unknown[] = [];
    const formatted = formatSciverseSearchOutput({
      hits: [{
        chunk: 'Measured cycle stability improved after 500 cycles.',
        chunk_id: 'chunk-7',
        doc_id: 'doc-42',
        doi: '10.1000/example',
        access_is_oa: true,
        access_oa_url: 'https://example.com/paper.pdf',
        author: ['A. Author'],
        file_name: 'papers/doc-42.pdf',
        offset: 1200,
        page_no: 8,
        publication_published_year: 2026,
        publication_venue_name_unified: 'Example Journal',
        score: 0.91,
        title: 'Graphene Battery Study'
      }]
    }, (source) => {
      sources.push(source);
      return sources.length;
    }, 'graphene battery');

    expect(formatted.modelOutput.evidence[0]).toMatchObject({
      doc_id: 'doc-42',
      marker: '[S1]',
      page_no: 8
    });
    expect(sources[0]).toMatchObject({
      provider: 'sciverse',
      doc_id: 'doc-42',
      chunk_id: 'chunk-7',
      authors: ['A. Author'],
      publication_year: 2026,
      access_oa_url: 'https://example.com/paper.pdf',
      resource_file_name: 'papers/doc-42.pdf'
    });
  });

  it('does not convert remote citations into local workspace note links', () => {
    const sources = sourcesFromMarkers(['S1', 'S2'], new Map([
      [1, {
        provider: 'sciverse' as const,
        doc_id: 'doc-42',
        title: 'Remote paper',
        quote: 'Remote evidence'
      }],
      [2, {
        entry_id: 'entry-1',
        entry_title: 'Local paper',
        page_idx: 2,
        quote: 'Local evidence',
        segment_uid: 'segment-3'
      }]
    ]));

    expect(sources).toEqual([{
      entryId: 'entry-1',
      entryTitle: 'Local paper',
      marker: 'S2',
      pageIdx: 2,
      quote: 'Local evidence',
      segmentUid: 'segment-3'
    }]);
  });

  it('bounds structured metadata and Paper Schema search inputs', () => {
    const scope = { entry_ids: [], entry_titles: [], tag_ids: [], tag_names: [] };
    expect(normalizeToolInput('search_sciverse_metadata', {
      fields: ['title', 42, 'doi'], page: 0, page_size: 99, query: 'retrieval augmented generation'
    }, { root: 'workspace', scope })).toEqual({
      fields: ['title', 'doi'], page: 1, page_size: 20, query: 'retrieval augmented generation'
    });
    expect(normalizeToolInput('search_sciverse_paper_schema', {
      page: 999, page_size: 0, query: 'benchmark'
    }, { root: 'workspace', scope })).toEqual({ page: 100, page_size: 1, query: 'benchmark' });
    expect(normalizeToolInput('get_sciverse_metadata_catalog', {}, { root: 'workspace', scope })).toEqual({});
  });
});

describe('formatWebSearchOutput', () => {
  it('dedupes by URL, deduplicates markers, and caps to the configured budget', () => {
    const sources: Array<Partial<{ provider: string; title: string; url: string; quote: string }>> = [];
    const output = formatWebSearchOutput({
      query: 'neuink',
      results: [
        { title: 'A', url: 'https://a.example', snippet: 'Alpha snippet' },
        { title: 'Dupe', url: 'https://a.example', snippet: 'duplicate of A' },
        { title: '', url: 'https://b.example', snippet: 'Beta snippet without title' },
        { title: 'No Url', url: '', snippet: 'should be dropped' }
      ]
    }, (source) => {
      sources.push(source);
      return sources.length;
    }, 10_000);

    expect(output.evidence).toHaveLength(2);
    expect(output.evidence.map((item) => item.marker)).toEqual(['[S1]', '[S2]']);
    expect(output.evidence[1]).toMatchObject({
      title: 'https://b.example',
      url: 'https://b.example'
    });
    expect(output.sources).toHaveLength(2);
    expect(output.sources[1]).toMatchObject({
      provider: 'web',
      title: 'https://b.example',
      url: 'https://b.example'
    });
    expect(output.summary).toContain('Found 2 web sources');
  });

  it('stops adding results once the snippet budget is exhausted', () => {
    // Each snippet is compact-quoted to <= 240 chars. A 250-char first result
    // leaves less than one more snippet worth of a 280-char budget, so the
    // second result is cut off the evidence list.
    const output = formatWebSearchOutput({
      query: 'budget',
      results: [
        { title: 'One', url: 'https://1.example', snippet: new Array(250).fill('a').join('') },
        { title: 'Two', url: 'https://2.example', snippet: 'second result that must be cut' }
      ]
    }, () => 1, 260);

    expect(output.evidence).toHaveLength(1);
    expect(output.evidence[0].url).toBe('https://1.example');
  });
});

describe('formatReadWebPageOutput', () => {
  it('registers the page as a web source and hands the markdown body to the model', () => {
    const sources: unknown[] = [];
    const output = formatReadWebPageOutput({
      url: 'https://a.example',
      title: 'Example',
      markdown: '# Title\n\nBody text here.',
      markdown_char_count: 29,
      truncated: false
    }, (source) => {
      sources.push(source);
      return sources.length;
    }, 10_000);

    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ provider: 'web', url: 'https://a.example' });
    expect(output.modelOutput).toMatchObject({
      kind: 'read_web_page',
      markdown: '# Title\n\nBody text here.',
      url: 'https://a.example',
      truncated: false
    });
    expect(output.summary).toContain('Example');
  });

  it('trims the body to the context budget and marks it truncated', () => {
    const body = new Array(600).fill('a').join('');
    const output = formatReadWebPageOutput({
      url: 'https://big.example',
      title: '',
      markdown: body,
      markdown_char_count: 600,
      truncated: false
    }, () => 1, 200);

    expect(output.modelOutput.truncated).toBe(true);
    expect(output.modelOutput.markdown.length).toBeLessThan(600);
    expect(output.sources[0].title).toBe('https://big.example');
  });
});
