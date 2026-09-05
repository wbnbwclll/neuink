// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { AnnotationCatalogRecord } from '@/shared/ipc/workspaceApi';

import { AnnotationLibraryView } from './AnnotationLibraryView';

const pageAnchoredRecord: AnnotationCatalogRecord = {
  annotation: {
    anchor_kind: 'pdf_page',
    annotation_id: 'annotation-1',
    content: '',
    created_at: '2026-09-05T00:00:00Z',
    importance: 'normal',
    kind: 'highlight',
    segment_snapshot: {
      asset_path: null,
      bbox: [100, 200, 300, 240],
      markdown: null,
      page_idx: 2,
      segment_type: 'paragraph',
      segment_uid: 'pdf-page:2',
      text: 'Selected before parsing',
    },
    segment_uid: 'pdf-page:2',
    text_selection: {
      color: 'yellow',
      page_idx: 2,
      rects: [[100, 200, 300, 240]],
      text: 'Selected before parsing',
    },
    updated_at: '2026-09-05T00:00:00Z',
  },
  entry_id: 'entry-1',
  entry_tag_ids: [],
  entry_title: 'Offline paper',
  segment: {
    asset_path: null,
    bbox: [100, 200, 300, 240],
    markdown: null,
    page_idx: 2,
    segment_type: 'paragraph',
    segment_uid: 'pdf-page:2',
    text: 'Selected before parsing',
  },
  segment_status: 'page_anchored',
};

describe('AnnotationLibraryView', () => {
  it('shows PDF page anchors as navigable rather than orphaned', async () => {
    const onOpenAnnotation = vi.fn();
    render(
      <AnnotationLibraryView
        activeTag={null}
        annotations={[pageAnchoredRecord]}
        standalone
        status="ready"
        tags={[]}
        onOpenAnnotation={onOpenAnnotation}
        onRefreshAnnotations={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getAllByText('PDF 页级锚点').length).toBeGreaterThan(0));
    expect(screen.queryByText('失联 1')).toBeNull();
    expect(screen.getAllByText('PDF 选区 · 第 3 页').length).toBeGreaterThan(0);

    const openButton = screen.getByRole('button', { name: '跳到原文' });
    expect(openButton.hasAttribute('disabled')).toBe(false);
    fireEvent.click(openButton);
    expect(onOpenAnnotation).toHaveBeenCalledWith(pageAnchoredRecord);
  });
});
