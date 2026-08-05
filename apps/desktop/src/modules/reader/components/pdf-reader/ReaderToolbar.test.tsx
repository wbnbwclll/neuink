/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReaderToolbar } from './ReaderToolbar';

describe('ReaderToolbar', () => {
  afterEach(() => cleanup());
  function buildPreferences(overrides = {}) {
    return {
      autoTranslateTextSelection: false,
      closeSegmentOverlayOnBlankClick: true,
      closeSegmentOverlayOnSameSegmentClick: true,
      hoverPreviewEnabled: true,
      hoverPreviewShowAnnotation: true,
      hoverPreviewShowNote: true,
      hoverPreviewShowOriginal: true,
      hoverPreviewShowRegion: true,
      hoverPreviewShowTranslation: true,
      leftClickOpensNotePane: true,
      segmentNoteOpenGesture: 'single' as const,
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
    render(
      <ReaderToolbar
        entry={buildEntry()}
        hasRetryableFailures={false}
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
        onRetryFailedTranslation={() => {}}
        onTagSuggestionsOpenChange={() => {}}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
      />
    );

    expect(screen.getByText('PDF 内容')).toBeTruthy();
    expect(screen.getByText('相对论笔记')).toBeTruthy();
    expect(screen.getByText('einstein-paper.pdf')).toBeTruthy();
    expect(screen.getByText('86 个区域')).toBeTruthy();
    expect(screen.getByText('12 页')).toBeTruthy();
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
    render(
      <ReaderToolbar
        entry={buildEntry()}
        hasRetryableFailures={false}
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
        onRetryFailedTranslation={() => {}}
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
    render(
      <ReaderToolbar
        entry={buildEntry()}
        hasRetryableFailures={false}
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
        onRetryFailedTranslation={() => {}}
        onTagSuggestionsOpenChange={() => {}}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
      />
    );

    expect(screen.getByTitle('切换为单页')).toBeTruthy();
  });
});
