// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Annotation, SourceSegment } from '@/shared/types/domain';

import { SegmentAnnotationEditor } from './SegmentAnnotationEditor';

afterEach(cleanup);

describe('SegmentAnnotationEditor', () => {
  it('reports the exact selected annotation so a linked PDF can locate its text range', () => {
    const onSelectAnnotation = vi.fn();
    render(
      <SegmentAnnotationEditor
        annotations={[annotation]}
        busy={false}
        pdfDocument={null}
        segment={segment}
        segments={[segment]}
        sourceEntryId="entry-1"
        workspaceRoot={null}
        onClose={() => undefined}
        onDelete={() => undefined}
        onModeChange={() => undefined}
        onSave={() => undefined}
        onSelectAnnotation={onSelectAnnotation}
      />,
    );

    const content = screen.getByText('A useful conclusion');
    fireEvent.click(content.closest('[role="button"]') as HTMLElement);

    expect(onSelectAnnotation).toHaveBeenCalledWith(annotation);
  });

  it('keeps annotation selection keyboard accessible', () => {
    const onSelectAnnotation = vi.fn();
    render(
      <SegmentAnnotationEditor
        annotations={[annotation]}
        busy={false}
        pdfDocument={null}
        segment={segment}
        segments={[segment]}
        sourceEntryId="entry-1"
        workspaceRoot={null}
        onClose={() => undefined}
        onDelete={() => undefined}
        onModeChange={() => undefined}
        onSave={() => undefined}
        onSelectAnnotation={onSelectAnnotation}
      />,
    );

    fireEvent.keyDown(screen.getByRole('button', { name: /A useful conclusion/ }), {
      key: 'Enter',
    });

    expect(onSelectAnnotation).toHaveBeenCalledWith(annotation);
  });
});

const segment: SourceSegment = {
  bbox: [100, 120, 900, 300],
  markdown: null,
  page_idx: 2,
  segment_type: 'paragraph',
  text: 'The source paragraph',
  uid: 'segment-1',
};

const annotation: Annotation = {
  annotation_id: 'annotation-1',
  content: 'A useful conclusion',
  created_at: '2026-09-05T00:00:00Z',
  importance: 'important',
  kind: 'highlight',
  segment_snapshot: {
    bbox: segment.bbox,
    markdown: segment.markdown,
    page_idx: segment.page_idx,
    segment_type: segment.segment_type,
    segment_uid: segment.uid,
    text: segment.text,
  },
  segment_uid: segment.uid,
  text_selection: {
    color: 'yellow',
    page_idx: 2,
    rects: [[180, 150, 520, 190]],
    text: 'source paragraph',
  },
  updated_at: '2026-09-05T00:00:00Z',
};
