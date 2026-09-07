// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastContext } from '@/shared/hooks/useToast';

import type { LibraryEntry } from '../../library/components/LibrarySidebar';
import { EntryLibraryView } from './EntryLibraryView';

const entry: LibraryEntry = {
  id: 'entry-1',
  contents: [],
  title: '可视分析论文',
  tagIds: ['hci'],
  tags: ['研究/HCI'],
  fields: { description: '测试条目' },
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-02T00:00:00.000Z',
  pdfFileName: 'paper.pdf',
  parseMessage: null,
  parseEndpoint: null,
  status: 'Parsed',
  progress: 100
};

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('EntryLibraryView tag folder layout', () => {
  it('switches from the table to persisted tag-folder navigation', () => {
    const onSelectTag = vi.fn();
    render(
      <ToastContext.Provider value={{ dismiss: vi.fn(), notify: vi.fn(() => 'toast') }}>
        <EntryLibraryView
          standalone
          activeTag={null}
          entries={[entry]}
          filterResetKey={0}
          isRefreshingParseStatus={false}
          libraryView="all"
          recentReadingEntryIds={[]}
          selectedEntryId={null}
          status="ready"
          tags={[
            { id: 'research', name: '研究', parent_id: null, created_at: '', updated_at: '' },
            { id: 'hci', name: 'HCI', parent_id: 'research', created_at: '', updated_at: '' }
          ]}
          trashItems={[]}
          trashedEntries={[]}
          workspaceRoot={null}
          onDeleteEntry={vi.fn()}
          onOpenCreateEntryTab={vi.fn()}
          onOpenEntryExplorer={vi.fn()}
          onOpenEntryInSidePane={vi.fn()}
          onPurgeEntry={vi.fn()}
          onPurgeTrashItem={vi.fn()}
          onRefreshParseStatus={vi.fn()}
          onReparseEntry={vi.fn()}
          onRestoreEntry={vi.fn()}
          onRestoreTrashItem={vi.fn()}
          onSelectEntry={vi.fn()}
          onSelectTag={onSelectTag}
          onUpdateEntry={vi.fn()}
        />
      </ToastContext.Provider>
    );

    fireEvent.click(screen.getByRole('radio', { name: '标签文件夹视图' }));

    expect(window.localStorage.getItem('neuink.entryLibraryLayout')).toBe('tag-folders');
    expect(screen.getByText('标签根目录')).toBeTruthy();
    expect(screen.getByText('研究')).toBeTruthy();
    expect(screen.getByText('1 个子文件夹 · 1 个条目')).toBeTruthy();
    expect(screen.queryByText('可视分析论文')).toBeNull();
    expect(screen.getByRole('table', { name: '标签文件夹内容' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: '名称' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: '修改日期' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /研究/ }));
    expect(onSelectTag).toHaveBeenCalledWith('research');
  });

  it('restores persisted table column visibility choices', () => {
    window.localStorage.setItem(
      'neuink.entryLibraryColumns.v1',
      JSON.stringify(['title', 'reading-progress', 'last-read', 'reading-time', 'file', 'parser', 'updated', 'actions'])
    );
    render(
      <ToastContext.Provider value={{ dismiss: vi.fn(), notify: vi.fn(() => 'toast') }}>
        <EntryLibraryView
          standalone
          activeTag={null}
          entries={[entry]}
          filterResetKey={0}
          isRefreshingParseStatus={false}
          libraryView="all"
          recentReadingEntryIds={[]}
          selectedEntryId={null}
          status="ready"
          tags={[]}
          trashItems={[]}
          trashedEntries={[]}
          workspaceRoot={null}
          onDeleteEntry={vi.fn()}
          onOpenCreateEntryTab={vi.fn()}
          onOpenEntryExplorer={vi.fn()}
          onOpenEntryInSidePane={vi.fn()}
          onPurgeEntry={vi.fn()}
          onPurgeTrashItem={vi.fn()}
          onRefreshParseStatus={vi.fn()}
          onReparseEntry={vi.fn()}
          onRestoreEntry={vi.fn()}
          onRestoreTrashItem={vi.fn()}
          onSelectEntry={vi.fn()}
          onSelectTag={vi.fn()}
          onUpdateEntry={vi.fn()}
        />
      </ToastContext.Provider>
    );

    expect(screen.getByRole('button', { name: '表头' })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: '标签' })).toBeNull();
  });
});
