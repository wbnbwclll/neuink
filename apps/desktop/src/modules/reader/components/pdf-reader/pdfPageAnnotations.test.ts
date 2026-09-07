import { describe, expect, it } from 'vitest';

import type { Annotation, SourceSegment } from '@/shared/types/domain';

import {
  mergePdfAnnotationAnchorSegments,
  pdfPageAnnotationSegmentUid,
  resolvePdfSelectionAnchorSegment,
} from './pdfPageAnnotations';

describe('PDF page annotation anchors', () => {
  it('falls back to a stable page segment when parsed regions are unavailable', () => {
    const segment = resolvePdfSelectionAnchorSegment({
      pageIdx: 4,
      rects: [[100, 200, 300, 240], [90, 250, 420, 290]],
      regions: [],
      text: 'Selected before parsing',
    });

    expect(segment.uid).toBe(pdfPageAnnotationSegmentUid(4));
    expect(segment.bbox).toEqual([90, 200, 420, 290]);
    expect(segment.raw_type).toBe('pdf_page_annotation_anchor');
  });

  it('keeps page anchors navigable and relates them to the closest parsed segment', () => {
    const parsedSegment: SourceSegment = {
      bbox: [80, 180, 440, 320],
      markdown: null,
      page_idx: 4,
      segment_type: 'paragraph',
      text: 'Parsed paragraph',
      uid: 'parsed-segment',
    };
    const annotation: Annotation = {
      anchor_kind: 'pdf_page',
      annotation_id: 'annotation-1',
      content: '',
      created_at: '2026-09-05T00:00:00Z',
      importance: 'normal',
      kind: 'highlight',
      segment_uid: pdfPageAnnotationSegmentUid(4),
      text_selection: {
        color: 'yellow',
        page_idx: 4,
        rects: [[100, 200, 300, 240]],
        text: 'Selected before parsing',
      },
      updated_at: '2026-09-05T00:00:00Z',
    };

    const merged = mergePdfAnnotationAnchorSegments([parsedSegment], [annotation]);

    expect(merged).toHaveLength(2);
    expect(merged[1]).toMatchObject({
      continuation_group_id: 'parsed-segment',
      uid: pdfPageAnnotationSegmentUid(4),
    });
  });
});
