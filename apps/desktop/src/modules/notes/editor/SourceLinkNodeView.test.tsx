// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SourceLinkNodeView } from './SourceLinkNodeView';

vi.mock('@tiptap/react', async () => {
  const React = await import('react');
  return {
    NodeViewWrapper: React.forwardRef<HTMLElement, React.ComponentProps<'div'> & { as?: React.ElementType }>(
      ({ as: Wrapper = 'div', ...props }, ref) => {
        const Component = Wrapper;
        return <Component ref={ref} {...props} />;
      }
    )
  };
});

vi.mock('@/shared/components/SourceSnapshotPreview', () => ({
  SourceSnapshotPreview: ({ markdown }: { markdown: string }) => (
    <span data-testid="source-preview">{markdown}</span>
  )
}));

function sourceNode(expanded = false) {
  return {
    attrs: {
      anchorId: 'sl-test-1',
      displayText: '关键结论',
      expanded,
      page: 3,
      previewAlignment: 'center',
      previewMode: 'parsed',
      previewWidth: 80,
      segmentUid: 'segment-7',
      sourceEntryId: 'entry-2',
      segmentType: 'paragraph',
      snapshotText: '这是保存的原文快照。'
    }
  } as Parameters<typeof SourceLinkNodeView>[0]['node'];
}

beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) }
  });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('SourceLinkNodeView', () => {
  it('expands a source preview and persists the state', () => {
    const updateAttributes = vi.fn();
    const result = render(
      <SourceLinkNodeView
        node={sourceNode()}
        onOpenSourceLink={vi.fn()}
        updateAttributes={updateAttributes}
      />
    );

    const trigger = result.getByRole('button', { name: /关键结论/ });
    expect(trigger.getAttribute('title')).toContain('单击预览');
    fireEvent.click(trigger);

    expect(result.getByTestId('source-preview').textContent).toBe('这是保存的原文快照。');
    expect(updateAttributes).toHaveBeenCalledWith({ expanded: true });
    expect(JSON.parse(window.localStorage.getItem('neuink.sourceLinkPreview.sl-test-1') ?? '{}'))
      .toMatchObject({ expanded: true, previewMode: 'parsed', previewWidth: 80 });
  });

  it('opens the source only once for Ctrl+click without expanding', () => {
    const onOpenSourceLink = vi.fn();
    const result = render(
      <SourceLinkNodeView node={sourceNode()} onOpenSourceLink={onOpenSourceLink} />
    );
    const trigger = result.getByRole('button', { name: /关键结论/ });

    fireEvent.mouseDown(trigger, { ctrlKey: true });
    fireEvent.click(trigger, { ctrlKey: true });

    expect(onOpenSourceLink).toHaveBeenCalledTimes(1);
    expect(onOpenSourceLink).toHaveBeenCalledWith({
      page: 3,
      segmentUid: 'segment-7',
      sourceEntryId: 'entry-2'
    });
    expect(result.queryByTestId('source-preview')).toBeNull();
  });

  it('updates preview controls, copies the citation, and deletes the node', async () => {
    const deleteNode = vi.fn();
    const updateAttributes = vi.fn();
    const result = render(
      <SourceLinkNodeView
        deleteNode={deleteNode}
        node={sourceNode(true)}
        updateAttributes={updateAttributes}
      />
    );

    fireEvent.click(result.getByTitle('显示引用工具'));
    fireEvent.click(result.getByTitle('右对齐'));
    fireEvent.change(result.getByRole('slider', { name: '引用宽度' }), {
      target: { value: '64' }
    });
    fireEvent.click(result.getByRole('button', { name: '复制' }));

    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1));
    expect(updateAttributes).toHaveBeenCalledWith({ previewAlignment: 'right' });
    expect(updateAttributes).toHaveBeenCalledWith({ previewWidth: 64 });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      '关键结论\np.3\n原文片段 segment-7\n"这是保存的原文快照。"'
    );

    fireEvent.click(result.getByRole('button', { name: '删除' }));
    expect(updateAttributes).toHaveBeenCalledWith({ expanded: false });
    expect(deleteNode).toHaveBeenCalledTimes(1);
  });
});
