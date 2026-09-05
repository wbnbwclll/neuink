/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./PdfSourcePage', () => ({ PdfSourcePage: () => null }));

import { PdfRecoveryActions } from './PdfReaderDocumentPane';

describe('PdfRecoveryActions', () => {
  afterEach(cleanup);

  it('offers reload, system-open, and reveal actions after a PDF failure', () => {
    const onOpenPdf = vi.fn();
    const onRetry = vi.fn();
    const onRevealPdf = vi.fn();
    render(
      <PdfRecoveryActions
        onOpenPdf={onOpenPdf}
        onRetry={onRetry}
        onRevealPdf={onRevealPdf}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
    fireEvent.click(screen.getByRole('button', { name: '系统打开' }));
    fireEvent.click(screen.getByRole('button', { name: '显示文件' }));

    expect(onRetry).toHaveBeenCalledOnce();
    expect(onOpenPdf).toHaveBeenCalledOnce();
    expect(onRevealPdf).toHaveBeenCalledOnce();
  });
});
