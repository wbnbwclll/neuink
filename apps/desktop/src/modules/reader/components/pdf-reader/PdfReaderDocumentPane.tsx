import { ExternalLink, FolderOpen, Loader2, RotateCcw } from 'lucide-react';
import type {
  MouseEvent as ReactMouseEvent,
  RefObject,
  WheelEvent as ReactWheelEvent
} from 'react';
import { useEffect } from 'react';

import type {
  Annotation,
  AnnotationImportance,
  AnnotationTextSelection,
  SegmentBlockNote,
  SourceSegment,
} from '@/shared/types/domain';
import type { TranslatedSegment } from '@/shared/ipc/workspaceApi';
import type { TranslationStatus } from '@/shared/ipc/workspaceApi';
import type { PdfHoverPreviewFontSize, PdfHoverPreviewSize } from '@/shared/lib/readerPreferences';
import { Button } from '@/components/ui/button';

import type { LibraryEntry } from '../../../library/components/LibrarySidebar';
import type { SourceBacklink, SourceBacklinksBySegmentUid } from '../../types';
import { PdfSourcePage } from './PdfSourcePage';
import { ReaderMessage } from './ReaderMessage';
import type { PdfLoadState } from './usePdfDocument';
import type { RetryablePdfBytesLoadState } from './usePdfBytes';
import type { PageSegments } from './types';
import { useVisiblePdfPages } from './useVisiblePdfPages';
import { PDF_SPREAD_GAP } from './readerConstants';
import { centeredPdfScrollLeft } from './pdfViewportLayout';

export function PdfReaderDocumentPane({
  activeAnnotationId,
  autoTranslateTextSelection = false,
  entry,
  activeSearchPageIdx,
  flashSegmentUid,
  hoveredSegmentUid,
  annotationsBySegmentUid,
  notesBySegmentUid,
  pageWidth,
  leftInset = 0,
  hoverPreviewEnabled,
  hoverPreviewFontSize,
  hoverPreviewSize,
  hoverPreviewShowRegion,
  hoverPreviewShowOriginal,
  hoverPreviewShowNote,
  hoverPreviewShowAnnotation,
  hoverPreviewShowTranslation,
  rows,
  searchMatchCountsByPage,
  searchQuery,
  pdfAvailable,
  pdfBytesState,
  bindPdfScrollElement,
  pdfScrollRef,
  pdfState,
  showRegions,
  suppressRegions,
  sourceBacklinksBySegmentUid,
  sourceLinkHint,
  translationBySegmentUid,
  translationStatus,
  translationMode,
  translationVisible,
  workspaceRoot,
  onCtrlWheelZoom,
  onOpenPdf,
  onRevealPdf,
  onAddSourceLink,
  onCopyContent,
  onCopySourceLink,
  onInsertSegmentImage,
  onTranslateSegment,
  onOpenSegmentAnnotation,
  onOpenSegmentNote,
  onOpenSegmentWorkspace,
  onOpenSourceBacklink,
  onAddAssistantContext,
  onCloseSegmentOverlay,
  onCreateTextSelectionAnnotation,
  onTranslateTextSelection,
  onToggleSegment,
  onVisiblePageIndexesChange,
  altClickOpensNote = false
}: {
  activeAnnotationId?: string | null;
  autoTranslateTextSelection?: boolean;
  entry: LibraryEntry;
  activeSearchPageIdx?: number | null;
  flashSegmentUid: string | null;
  hoveredSegmentUid: string | null;
  annotationsBySegmentUid: Map<string, Annotation[]>;
  notesBySegmentUid: Map<string, SegmentBlockNote>;
  pageWidth: number;
  leftInset?: number;
  hoverPreviewEnabled: boolean;
  hoverPreviewFontSize: PdfHoverPreviewFontSize;
  hoverPreviewSize: PdfHoverPreviewSize;
  hoverPreviewShowRegion: boolean;
  hoverPreviewShowOriginal: boolean;
  hoverPreviewShowNote: boolean;
  hoverPreviewShowAnnotation: boolean;
  hoverPreviewShowTranslation: boolean;
  rows: PageSegments[][];
  searchMatchCountsByPage?: Map<number, number>;
  searchQuery?: string;
  pdfAvailable: boolean;
  pdfBytesState: RetryablePdfBytesLoadState;
  bindPdfScrollElement: (element: HTMLDivElement | null) => void;
  pdfScrollRef: RefObject<HTMLDivElement>;
  pdfState: PdfLoadState;
  showRegions: boolean;
  suppressRegions: boolean;
  sourceBacklinksBySegmentUid: SourceBacklinksBySegmentUid;
  sourceLinkHint?: string;
  translationBySegmentUid: Map<string, TranslatedSegment>;
  translationStatus: TranslationStatus | null;
  translationMode: 'replace' | 'hover';
  translationVisible: boolean;
  workspaceRoot: string | null;
  onCtrlWheelZoom: (request: {
    clientX: number;
    clientY: number;
    container: HTMLDivElement;
    direction: 1 | -1;
  }) => void;
  onOpenPdf?: () => void;
  onRevealPdf?: () => void;
  onAddSourceLink?: (segment: SourceSegment) => void;
  onCopyContent?: (segment: SourceSegment) => void;
  onCopySourceLink?: (segment: SourceSegment) => void;
  onInsertSegmentImage?: (segment: SourceSegment) => void;
  onTranslateSegment?: (segment: SourceSegment) => void;
  onOpenSegmentAnnotation: (segment: SourceSegment) => void;
  onOpenSegmentNote: (segment: SourceSegment) => void;
  onOpenSegmentWorkspace?: (segment: SourceSegment) => void;
  onOpenSourceBacklink: (backlink: SourceBacklink) => void;
  onAddAssistantContext?: (segment: SourceSegment) => void;
  onCloseSegmentOverlay: () => void;
  onCreateTextSelectionAnnotation: (input: {
    content: string;
    importance: AnnotationImportance;
    segment: SourceSegment;
    selection: AnnotationTextSelection;
  }) => Promise<void> | void;
  onTranslateTextSelection?: (input: { segment: SourceSegment; text: string }) => Promise<string>;
  onToggleSegment: (segment: SourceSegment) => void;
  onVisiblePageIndexesChange?: (pageIndexes: number[]) => void;
  altClickOpensNote?: boolean;
}) {
  const pageCount = rows.reduce((sum, row) => sum + row.length, 0);
  const { renderPageIndexes, visiblePageIndexes } = useVisiblePdfPages({
    pageCount,
    scrollRef: pdfScrollRef
  });
  useEffect(() => {
    onVisiblePageIndexesChange?.([...visiblePageIndexes].sort((left, right) => left - right));
  }, [onVisiblePageIndexesChange, visiblePageIndexes]);
  useEffect(() => {
    const element = pdfScrollRef.current;
    if (!element) return undefined;

    const animationFrame = window.requestAnimationFrame(() => {
      const nextScrollLeft = centeredPdfScrollLeft(
        element.scrollWidth,
        element.clientWidth
      );
      if (element.scrollLeft !== nextScrollLeft) {
        element.scrollLeft = nextScrollLeft;
      }
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [pageWidth, pdfScrollRef]);
  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey || event.deltaY === 0) {
      return;
    }

    event.preventDefault();
    onCtrlWheelZoom({
      clientX: event.clientX,
      clientY: event.clientY,
      container: event.currentTarget,
      direction: event.deltaY < 0 ? 1 : -1
    });
  };
  const handleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (hasActiveTextSelection()) {
      return;
    }

    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-pdf-page-index]')) {
      return;
    }

    onCloseSegmentOverlay();
  };

  return (
    <div
      ref={bindPdfScrollElement}
      className="pdf-document-scroll h-full w-full min-h-0 min-w-0 max-w-full overflow-auto px-3 py-2"
      onClick={handleClick}
      onWheel={handleWheel}
    >
      {pdfState.status === 'ready' ? (
        <div
          style={{
            marginLeft: leftInset,
            width: `calc(100% - ${leftInset}px)`
          }}
        >
          {rows.map((row) => (
            <div
              key={row[0].pageIdx}
              className="flex w-max min-w-full justify-center"
              style={{ gap: PDF_SPREAD_GAP }}
            >
              {row.map((page) => {
                const renderEnabled = renderPageIndexes.has(page.pageIdx);
                const visible = visiblePageIndexes.has(page.pageIdx);
                return (
                  <PdfSourcePage
                    activeAnnotationId={activeAnnotationId}
                    searchActive={activeSearchPageIdx === page.pageIdx}
                    searchMatchCount={searchMatchCountsByPage?.get(page.pageIdx) ?? 0}
                    searchQuery={searchQuery}
                    autoTranslateTextSelection={autoTranslateTextSelection}
                    annotationsBySegmentUid={annotationsBySegmentUid}
                    flashSegmentUid={flashSegmentUid}
                    hoveredSegmentUid={hoveredSegmentUid}
                    hoverPreviewEnabled={hoverPreviewEnabled}
                    hoverPreviewFontSize={hoverPreviewFontSize}
                    hoverPreviewSize={hoverPreviewSize}
                    hoverPreviewShowRegion={hoverPreviewShowRegion}
                    hoverPreviewShowOriginal={hoverPreviewShowOriginal}
                    hoverPreviewShowNote={hoverPreviewShowNote}
                    hoverPreviewShowAnnotation={hoverPreviewShowAnnotation}
                    hoverPreviewShowTranslation={hoverPreviewShowTranslation}
                    key={page.pageIdx}
                    notesBySegmentUid={notesBySegmentUid}
                    page={page}
                    pageWidth={pageWidth}
                    pdfDocument={pdfState.document}
                    renderPriority={visible ? 'visible' : 'preload'}
                    renderEnabled={renderEnabled}
                    showRegions={showRegions}
                    sourceEntryId={entry.id}
                    sourceBacklinksBySegmentUid={sourceBacklinksBySegmentUid}
                    sourceLinkHint={sourceLinkHint}
                    // A page in the render window must remain interactive even
                    // while IntersectionObserver catches up after a smooth scroll.
                    suppressRegions={suppressRegions || !renderEnabled}
                    translationBySegmentUid={translationBySegmentUid}
                    translationStatus={translationStatus}
                    translationMode={translationMode}
                    translationVisible={translationVisible}
                    workspaceRoot={workspaceRoot}
                    onAddSourceLink={onAddSourceLink}
                    onCopyContent={onCopyContent}
                    onCopySourceLink={onCopySourceLink}
                    onInsertSegmentImage={onInsertSegmentImage}
                    onTranslateSegment={onTranslateSegment}
                    onOpenSegmentAnnotation={onOpenSegmentAnnotation}
                    onOpenSegmentNote={onOpenSegmentNote}
                    onOpenSegmentWorkspace={onOpenSegmentWorkspace}
                    onOpenSourceBacklink={onOpenSourceBacklink}
                    onAddAssistantContext={onAddAssistantContext}
                    onCloseSegmentOverlay={onCloseSegmentOverlay}
                    onCreateTextSelectionAnnotation={onCreateTextSelectionAnnotation}
                    onTranslateTextSelection={onTranslateTextSelection}
                    onToggleSegment={onToggleSegment}
                    altClickOpensNote={altClickOpensNote}
                  />
                );
              })}
            </div>
          ))}
        </div>
      ) : pdfBytesState.status === 'loading' || pdfState.status === 'loading' ? (
        <ReaderMessage
          icon={
            <Loader2 className="animate-spin" size={22} aria-hidden="true" />
          }
          title={pdfBytesState.status === 'loading' ? '正在读取 PDF' : '正在渲染 PDF'}
          description={
            pdfBytesState.status === 'loading'
              ? '正在从本地工作区读取 PDF 文件。'
              : '正在用 PDF.js 渲染本地 PDF 页面。'
          }
        />
      ) : pdfBytesState.status === 'error' ? (
        <ReaderMessage
          title="PDF 读取失败"
          description={pdfBytesState.error}
          tone="danger"
          action={
            <PdfRecoveryActions
              onOpenPdf={onOpenPdf}
              onRetry={pdfBytesState.retry}
              onRevealPdf={onRevealPdf}
            />
          }
        />
      ) : pdfState.status === 'error' ? (
        <ReaderMessage
          title="PDF 渲染失败"
          description={pdfState.error}
          tone="danger"
          action={
            <PdfRecoveryActions
              onOpenPdf={onOpenPdf}
              onRetry={pdfBytesState.retry}
              onRevealPdf={onRevealPdf}
            />
          }
        />
      ) : (
        <ReaderMessage
          title="PDF 路径不可用"
          description={pdfAvailable ? '本地 PDF 尚未完成读取。' : '当前条目没有可读取的 PDF 路径。'}
        />
      )}
    </div>
  );
}

export function PdfRecoveryActions({
  onOpenPdf,
  onRetry,
  onRevealPdf
}: {
  onOpenPdf?: () => void;
  onRetry: () => void;
  onRevealPdf?: () => void;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      <Button size="sm" type="button" variant="outline" onClick={onRetry}>
        <RotateCcw size={14} aria-hidden="true" />
        重新加载
      </Button>
      {onOpenPdf ? (
        <Button size="sm" type="button" variant="outline" onClick={onOpenPdf}>
          <ExternalLink size={14} aria-hidden="true" />
          系统打开
        </Button>
      ) : null}
      {onRevealPdf ? (
        <Button size="sm" type="button" variant="outline" onClick={onRevealPdf}>
          <FolderOpen size={14} aria-hidden="true" />
          显示文件
        </Button>
      ) : null}
    </div>
  );
}


function hasActiveTextSelection() {
  const selection = window.getSelection();

  return Boolean(
    selection && !selection.isCollapsed && selection.toString().trim()
  );
}
