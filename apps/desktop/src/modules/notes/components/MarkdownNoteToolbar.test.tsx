// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MarkdownNoteToolbar } from './MarkdownNoteToolbar';

describe('MarkdownNoteToolbar', () => {
  it('keeps formatting and insert controls in one non-scrolling responsive toolbar', () => {
    const result = render(
      <MarkdownNoteToolbar
        activeSourceCount={0}
        disabled
        editor={null}
        imageBusy={false}
        imageDisabled
        insertAt={null}
        insertMenuAnchor={null}
        sourcePanelOpen={false}
        onCloseInsertMenu={vi.fn()}
        onInsertImage={vi.fn()}
        onOpenInsertMenu={vi.fn()}
        onToggleSourcePanel={vi.fn()}
      />
    );

    expect(result.getByTitle('插入块').className).toContain('h-7');
    expect(result.getByLabelText('更多格式')).toBeTruthy();
    expect(result.container.querySelector('[data-note-formatting-toolbar="true"]')?.className)
      .not.toContain('overflow-x-auto');
    expect(result.container.querySelector('[data-note-editor-toolbar="true"]')?.className)
      .toContain('items-center');
  });
});
