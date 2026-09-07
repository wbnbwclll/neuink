/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';

import { ReaderToolbar } from './ReaderToolbar';

describe('ReaderToolbar', () => {
  afterEach(() => cleanup());
  function buildPreferences(overrides = {}) {
    return {
      autoTranslateTextSelection: false,
      closeSegmentOverlayOnBlankClick: true,
      closeSegmentOverlayOnSameSegmentClick: true,
      hoverPreviewEnabled: true,
      pdfHoverPreviewFontSize: 'standard' as const,
      pdfHoverPreviewSize: 'standard' as const,
      hoverPreviewShowAnnotation: true,
      hoverPreviewShowNote: true,
      hoverPreviewShowOriginal: true,
      hoverPreviewShowRegion: true,
      hoverPreviewShowTranslation: true,
      leftClickOpensNotePane: true,
      segmentNoteOpenGesture: 'single' as const,
      reflowBackgroundColor: '#ffffff',
      reflowComponents: {
        heading: { visible: true, size: 'standard' as const },
        paragraph: { visible: true, size: 'standard' as const },
        list: { visible: true, size: 'standard' as const },
        table: { visible: true, size: 'standard' as const },
        math: { visible: true, size: 'standard' as const },
        code: { visible: true, size: 'standard' as const },
        supportingText: { visible: true, size: 'standard' as const },
        figure: { visible: true, size: 'standard' as const },
        chart: { visible: true, size: 'large' as const },
        diagramVisible: true,
        imageClickToOpen: true,
      },
      reflowFontSize: 16,
      reflowHoverSourceEnabled: true,
      reflowTranslationMode: 'source' as const,
      showRegions: false,
      pageDisplayMode: 'single' as const,
      ...overrides,
    };
  }

  function buildEntry() {
    return {
      id: 'entry-1',
      contents: [] as never[],
      title: '相对论笔记',
      tagIds: [],
      tags: [],
      fields: {},
      createdAt: '',
      updatedAt: '',
      pdfFileName: 'einstein-paper.pdf',
      parseMessage: null,
      parseEndpoint: null,
      status: 'Parsed' as const,
      progress: 100,
    };
  }

  it('keeps the content title with compact reader metadata', () => {
    const onOpenTranslationTask = vi.fn();
    const onZoomIn = vi.fn();
    const onZoomOut = vi.fn();
    renderWithTooltipProvider(
      <ReaderToolbar
        entry={buildEntry()}
        pageCount={12}
        readerPreferences={buildPreferences()}
        recommendedTags={[]}
        segmentCount={86}
        selectedRecommendedTagPaths={[]}
        tagSuggestionBusy={false}
        tagSuggestionsOpen={false}
        translation={null}
        translationBusy={false}
        zoom={1}
        onApplyRecommendedTags={() => {}}
        onDismissRecommendedTags={() => {}}
        onExportTranslation={() => {}}
        onOpenTranslationTask={onOpenTranslationTask}
        onPauseTranslation={() => {}}
        onReaderPreferencesChange={() => {}}
        onRecommendedTagToggle={() => {}}
        onTagSuggestionsOpenChange={() => {}}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
      />
    );

    expect(screen.getByText('PDF 内容')).toBeTruthy();
    expect(screen.getByText('相对论笔记')).toBeTruthy();
    expect(screen.getByText('einstein-paper.pdf')).toBeTruthy();
    expect(screen.getByText('86 个区域')).toBeTruthy();
    expect(screen.getByText('/ 12')).toBeTruthy();
    expect(screen.getByText('已解析')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '翻译任务' }));
    fireEvent.click(screen.getByTitle('缩小'));
    fireEvent.click(screen.getByTitle('放大'));
    expect(onOpenTranslationTask).toHaveBeenCalledOnce();
    expect(onZoomOut).toHaveBeenCalledOnce();
    expect(onZoomIn).toHaveBeenCalledOnce();
  });

  it('toggles page display mode via Columns2 button', () => {
    const onChange = vi.fn();
    renderWithTooltipProvider(
      <ReaderToolbar
        entry={buildEntry()}
        pageCount={12}
        readerPreferences={buildPreferences({ pageDisplayMode: 'single' })}
        recommendedTags={[]}
        segmentCount={86}
        selectedRecommendedTagPaths={[]}
        tagSuggestionBusy={false}
        tagSuggestionsOpen={false}
        translation={null}
        translationBusy={false}
        zoom={1}
        onApplyRecommendedTags={() => {}}
        onDismissRecommendedTags={() => {}}
        onExportTranslation={() => {}}
        onOpenTranslationTask={() => {}}
        onPauseTranslation={() => {}}
        onReaderPreferencesChange={onChange}
        onRecommendedTagToggle={() => {}}
        onTagSuggestionsOpenChange={() => {}}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
      />
    );

    fireEvent.click(screen.getByTitle('切换为双页'));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ pageDisplayMode: 'dual' })
    );
  });

  it('shows dual-to-single tooltip when dual is active', () => {
    renderWithTooltipProvider(
      <ReaderToolbar
        entry={buildEntry()}
        pageCount={12}
        readerPreferences={buildPreferences({ pageDisplayMode: 'dual' })}
        recommendedTags={[]}
        segmentCount={86}
        selectedRecommendedTagPaths={[]}
        tagSuggestionBusy={false}
        tagSuggestionsOpen={false}
        translation={null}
        translationBusy={false}
        zoom={1}
        onApplyRecommendedTags={() => {}}
        onDismissRecommendedTags={() => {}}
        onExportTranslation={() => {}}
        onOpenTranslationTask={() => {}}
        onPauseTranslation={() => {}}
        onReaderPreferencesChange={() => {}}
        onRecommendedTagToggle={() => {}}
        onTagSuggestionsOpenChange={() => {}}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
      />
    );

    expect(screen.getByTitle('切换为单页')).toBeTruthy();
  });

  it('keeps low-frequency PDF actions available from the compact overflow menu', () => {
    const onOpenTranslationTask = vi.fn();
    const onReparsePdf = vi.fn();
    renderWithTooltipProvider(
      <ReaderToolbar
        entry={buildEntry()}
        pageCount={12}
        readerPreferences={buildPreferences()}
        recommendedTags={[]}
        segmentCount={86}
        selectedRecommendedTagPaths={[]}
        tagSuggestionBusy={false}
        tagSuggestionsOpen={false}
        translation={null}
        translationBusy={false}
        zoom={1}
        onApplyRecommendedTags={() => {}}
        onDismissRecommendedTags={() => {}}
        onExportTranslation={() => {}}
        onOpenTranslationTask={onOpenTranslationTask}
        onPauseTranslation={() => {}}
        onReaderPreferencesChange={() => {}}
        onRecommendedTagToggle={() => {}}
        onReparsePdf={onReparsePdf}
        onTagSuggestionsOpenChange={() => {}}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
      />
    );

    fireEvent.keyDown(screen.getByRole('button', { name: '更多 PDF 操作' }), {
      key: 'Enter'
    });
    fireEvent.click(screen.getByRole('menuitem', { name: '打开翻译任务' }));
    expect(onOpenTranslationTask).toHaveBeenCalledOnce();

    fireEvent.keyDown(screen.getByRole('button', { name: '更多 PDF 操作' }), {
      key: 'Enter'
    });
    fireEvent.click(screen.getByRole('menuitem', { name: '重新解析 PDF' }));
    expect(onReparsePdf).toHaveBeenCalledOnce();
  });

  it('supports page navigation, in-document search, and non-blocking queued parsing', () => {
    const onCurrentPageChange = vi.fn();
    const onSearchNext = vi.fn();
    const onSearchPrevious = vi.fn();
    const onSearchQueryChange = vi.fn();
    const onStartPdfParse = vi.fn();
    renderWithTooltipProvider(
      <ReaderToolbar
        currentPage={5}
        entry={{ ...buildEntry(), progress: 0, status: 'Queued' }}
        pageCount={12}
        readerPreferences={buildPreferences()}
        recommendedTags={[]}
        searchActiveMatchNumber={2}
        searchMatchCount={3}
        searchQuery="alpha"
        searchStatus="ready"
        segmentCount={0}
        selectedRecommendedTagPaths={[]}
        tagSuggestionBusy={false}
        tagSuggestionsOpen={false}
        translation={null}
        translationBusy={false}
        zoom={1}
        onApplyRecommendedTags={() => {}}
        onCurrentPageChange={onCurrentPageChange}
        onDismissRecommendedTags={() => {}}
        onExportTranslation={() => {}}
        onOpenTranslationTask={() => {}}
        onPauseTranslation={() => {}}
        onReaderPreferencesChange={() => {}}
        onRecommendedTagToggle={() => {}}
        onSearchNext={onSearchNext}
        onSearchPrevious={onSearchPrevious}
        onSearchQueryChange={onSearchQueryChange}
        onStartPdfParse={onStartPdfParse}
        onTagSuggestionsOpenChange={() => {}}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '上一页' }));
    expect(onCurrentPageChange).toHaveBeenCalledWith(4);

    const pageInput = screen.getByRole('textbox', { name: '当前页码' });
    expect(pageInput.getAttribute('type')).toBe('text');
    fireEvent.change(pageInput, { target: { value: '9' } });
    fireEvent.submit(pageInput.closest('form') as HTMLFormElement);
    expect(onCurrentPageChange).toHaveBeenCalledWith(9);

    expect(screen.getByText('2/3')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '下一个匹配' }));
    fireEvent.click(screen.getByRole('button', { name: '上一个匹配' }));
    expect(onSearchNext).toHaveBeenCalledOnce();
    expect(onSearchPrevious).toHaveBeenCalledOnce();

    fireEvent.change(screen.getByRole('searchbox', { name: '在当前 PDF 中查找' }), {
      target: { value: 'beta' }
    });
    expect(onSearchQueryChange).toHaveBeenCalledWith('beta');

    fireEvent.click(screen.getByRole('button', { name: '开始解析 PDF' }));
    expect(onStartPdfParse).toHaveBeenCalledOnce();
  });

  it('moves by a complete spread in dual-page mode and keeps page input numeric', () => {
    const onCurrentPageChange = vi.fn();
    renderWithTooltipProvider(
      <ReaderToolbar
        currentPage={2}
        entry={buildEntry()}
        pageCount={12}
        readerPreferences={buildPreferences({ pageDisplayMode: 'dual' })}
        recommendedTags={[]}
        segmentCount={86}
        selectedRecommendedTagPaths={[]}
        tagSuggestionBusy={false}
        tagSuggestionsOpen={false}
        translation={null}
        translationBusy={false}
        zoom={1}
        onApplyRecommendedTags={() => {}}
        onCurrentPageChange={onCurrentPageChange}
        onDismissRecommendedTags={() => {}}
        onExportTranslation={() => {}}
        onOpenTranslationTask={() => {}}
        onPauseTranslation={() => {}}
        onReaderPreferencesChange={() => {}}
        onRecommendedTagToggle={() => {}}
        onTagSuggestionsOpenChange={() => {}}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(onCurrentPageChange).toHaveBeenCalledWith(3);
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(onCurrentPageChange).toHaveBeenLastCalledWith(5);

    const pageInput = screen.getByRole('textbox', { name: '当前页码' });
    expect(pageInput.className).toContain('h-6');
    expect(pageInput.className).toContain('w-9');
    fireEvent.change(pageInput, { target: { value: '8abc' } });
    expect((pageInput as HTMLInputElement).value).toBe('8');
  });

  it('keeps the original PDF controls available after parsing fails', () => {
    const onRetryPdfParse = vi.fn();
    renderWithTooltipProvider(
      <ReaderToolbar
        entry={{ ...buildEntry(), progress: 0, status: 'Failed' }}
        pageCount={12}
        readerPreferences={buildPreferences()}
        recommendedTags={[]}
        segmentCount={0}
        selectedRecommendedTagPaths={[]}
        tagSuggestionBusy={false}
        tagSuggestionsOpen={false}
        translation={null}
        translationBusy={false}
        zoom={1}
        onApplyRecommendedTags={() => {}}
        onDismissRecommendedTags={() => {}}
        onExportTranslation={() => {}}
        onOpenTranslationTask={() => {}}
        onPauseTranslation={() => {}}
        onReaderPreferencesChange={() => {}}
        onRecommendedTagToggle={() => {}}
        onRetryPdfParse={onRetryPdfParse}
        onTagSuggestionsOpenChange={() => {}}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '重试解析 PDF' }));
    expect(onRetryPdfParse).toHaveBeenCalledOnce();
    expect(screen.getByRole('searchbox', { name: '在当前 PDF 中查找' })).toBeTruthy();
  });
});

function renderWithTooltipProvider(element: ReactElement) {
  return render(<TooltipProvider>{element}</TooltipProvider>);
}
