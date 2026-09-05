// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SourceBacklink } from '../types';
import { SourceLinksSurface } from './SourceLinksSurface';

const backlink: SourceBacklink = {
  anchorId: 'sl-1',
  displayText: '证据',
  linkId: 'link-1',
  noteEntryId: 'note-entry',
  noteEntryTitle: '研究条目',
  noteId: 'note-1',
  noteTitle: '实验记录',
  segmentUid: 'segment-7',
  sourceEntryId: 'source-entry'
};

afterEach(cleanup);

describe('SourceLinksSurface', () => {
  it('shows a stable empty state', () => {
    const result = render(
      <SourceLinksSurface
        backlinks={[]}
        entryTitle="来源文献"
        linkedReaderKind={null}
        onLocateSource={vi.fn()}
        onOpenNote={vi.fn()}
      />
    );

    expect(result.getByText('暂无来源链接')).toBeTruthy();
    expect(result.queryByRole('button', { name: '定位原文' })).toBeNull();
  });

  it('opens the note while keeping source location as an explicit second action', () => {
    const onLocateSource = vi.fn();
    const onOpenNote = vi.fn();
    const result = render(
      <SourceLinksSurface
        backlinks={[backlink]}
        entryTitle="来源文献"
        linkedReaderKind="reflow"
        onLocateSource={onLocateSource}
        onOpenNote={onOpenNote}
      />
    );

    fireEvent.click(result.getByRole('button', { name: /实验记录/ }));
    fireEvent.click(result.getByRole('button', { name: '定位原文' }));

    expect(onOpenNote).toHaveBeenCalledWith(backlink);
    expect(onLocateSource).toHaveBeenCalledWith('segment-7');
    expect(result.getByTitle('在配对的重排视图中定位')).toBeTruthy();
  });
});
