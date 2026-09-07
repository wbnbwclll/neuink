import type { Annotation, SourceSegment } from '@/shared/types/domain';

import type { PageSegments } from './types';

export const PDF_PAGE_ANNOTATION_SEGMENT_PREFIX = 'pdf-page:';

export function pdfPageAnnotationSegmentUid(pageIdx: number) {
  return `${PDF_PAGE_ANNOTATION_SEGMENT_PREFIX}${pageIdx}`;
}

export function resolvePdfSelectionAnchorSegment({
  pageIdx,
  rects,
  regions,
  text,
}: {
  pageIdx: number;
  rects: Array<[number, number, number, number]>;
  regions: PageSegments['regions'];
  text: string;
}) {
  let best: { area: number; segment: SourceSegment } | null = null;
  for (const region of regions) {
    const area = rects.reduce(
      (total, rect) => total + intersectionArea(rect, region.bbox),
      0,
    );
    if (!best || area > best.area) {
      best = { area, segment: region.sourceSegment };
    }
  }
  return best?.area
    ? best.segment
    : createPdfPageAnnotationSegment(pageIdx, text, rects);
}

export function createPdfPageAnnotationSegment(
  pageIdx: number,
  text: string,
  rects: Array<[number, number, number, number]>,
): SourceSegment {
  return {
    asset_path: null,
    bbox: boundingRect(rects),
    block_role: null,
    continuation_group_id: null,
    markdown: null,
    mineru_metadata: {},
    page_idx: pageIdx,
    raw_type: 'pdf_page_annotation_anchor',
    segment_type: 'paragraph',
    sub_type: null,
    text: text.trim(),
    uid: pdfPageAnnotationSegmentUid(pageIdx),
    visual_group_id: null,
  };
}

export function annotationPageAnchorSegment(annotation: Annotation): SourceSegment | null {
  const selection = annotation.text_selection;
  const isPageAnchor =
    annotation.anchor_kind === 'pdf_page' ||
    annotation.segment_uid.startsWith(PDF_PAGE_ANNOTATION_SEGMENT_PREFIX);
  if (!isPageAnchor || !selection) return null;

  const segment = createPdfPageAnnotationSegment(
    selection.page_idx,
    selection.text,
    selection.rects,
  );
  const snapshot = annotation.segment_snapshot;
  return {
    ...segment,
    bbox: snapshot?.bbox ?? segment.bbox,
    text: snapshot?.text?.trim() || segment.text,
    uid: annotation.segment_uid,
  };
}

export function mergePdfAnnotationAnchorSegments(
  segments: SourceSegment[],
  annotations: Annotation[],
) {
  const merged = [...segments];
  const knownUids = new Set(segments.map((segment) => segment.uid));
  for (const annotation of annotations) {
    if (knownUids.has(annotation.segment_uid)) continue;
    const anchor = annotationPageAnchorSegment(annotation);
    if (!anchor) continue;
    const relatedSegment = findClosestPageSegment(anchor, segments);
    merged.push({
      ...anchor,
      continuation_group_id: relatedSegment
        ? relatedSegment.continuation_group_id ?? relatedSegment.uid
        : null,
    });
    knownUids.add(anchor.uid);
  }
  return merged;
}

function findClosestPageSegment(anchor: SourceSegment, segments: SourceSegment[]) {
  if (!anchor.bbox) return null;
  let best: { distance: number; overlap: number; segment: SourceSegment } | null = null;
  for (const segment of segments) {
    if (segment.page_idx !== anchor.page_idx || !segment.bbox) continue;
    const overlap = intersectionArea(anchor.bbox, segment.bbox);
    const distance = centerDistanceSquared(anchor.bbox, segment.bbox);
    if (
      !best ||
      overlap > best.overlap ||
      (overlap === best.overlap && distance < best.distance)
    ) {
      best = { distance, overlap, segment };
    }
  }
  return best?.segment ?? null;
}

function boundingRect(rects: Array<[number, number, number, number]>) {
  const first = rects[0];
  if (!first) return null;
  return rects.slice(1).reduce<[number, number, number, number]>(
    (bounds, rect) => [
      Math.min(bounds[0], rect[0]),
      Math.min(bounds[1], rect[1]),
      Math.max(bounds[2], rect[2]),
      Math.max(bounds[3], rect[3]),
    ],
    [...first],
  );
}

function intersectionArea(
  left: readonly [number, number, number, number],
  right: readonly [number, number, number, number],
) {
  const width = Math.max(0, Math.min(left[2], right[2]) - Math.max(left[0], right[0]));
  const height = Math.max(0, Math.min(left[3], right[3]) - Math.max(left[1], right[1]));
  return width * height;
}

function centerDistanceSquared(
  left: readonly [number, number, number, number],
  right: readonly [number, number, number, number],
) {
  const x = (left[0] + left[2] - right[0] - right[2]) / 2;
  const y = (left[1] + left[3] - right[1] - right[3]) / 2;
  return x * x + y * y;
}
