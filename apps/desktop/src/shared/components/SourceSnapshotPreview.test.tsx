/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SourceSnapshotPreview } from './SourceSnapshotPreview';

vi.mock('./MermaidDiagramPreview', () => ({
  MermaidDiagramPreview: ({ code }: { code: string }) => (
    <div data-code={code} data-testid="mermaid-preview" />
  ),
}));

describe('SourceSnapshotPreview', () => {
  afterEach(() => cleanup());

  it('renders Mermaid code fences as diagrams in parsed PDF previews', () => {
    render(
      <SourceSnapshotPreview
        markdown={'```mermaid\ngraph TD\n  A --> B\n```'}
        previewMode="parsed"
      />,
    );

    expect(screen.getByTestId('mermaid-preview').getAttribute('data-code')).toBe(
      'graph TD\n A --> B',
    );
  });

  it('renders syntax-free paragraphs through the plain-text fast path', () => {
    render(
      <SourceSnapshotPreview markdown={'这是一段不含任何 Markdown 语法的普通文本。'} />
    );

    expect(
      screen.getByText('这是一段不含任何 Markdown 语法的普通文本。').tagName
    ).toBe('P');
  });

  it('still applies the markdown pipeline to formatted text', () => {
    render(<SourceSnapshotPreview markdown={'**加粗结论**与后续正文'} />);

    expect(screen.getByText('加粗结论').tagName).toBe('STRONG');
  });

  it('can suppress parsed Mermaid diagrams', () => {
    render(
      <SourceSnapshotPreview
        markdown={'```mermaid\ngraph TD\n  A --> B\n```'}
        showMermaidDiagrams={false}
      />
    );

    expect(screen.queryByTestId('mermaid-preview')).toBeNull();
  });

  it('applies a configurable image size and opens image details', () => {
    render(
      <SourceSnapshotPreview
        imageDetailEnabled
        imageSize="compact"
        markdown="![流程图](https://example.com/flow.png)"
      />
    );

    const trigger = screen.getByRole('button', { name: '查看流程图详情' });
    expect(trigger.querySelector('img')?.className).toContain('max-h-48');
    fireEvent.click(trigger);

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('图片详情')).toBeTruthy();
  });
});
