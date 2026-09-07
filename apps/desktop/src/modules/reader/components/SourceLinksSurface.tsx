import { Link2 } from 'lucide-react';

import type { WorkspaceReaderSurfaceKind } from '@/app/workspaceSurfacePairing';
import { Button } from '@/components/ui/button';

import type { SourceBacklink } from '../types';
import { EntryContentHeader } from './EntryContentHeader';
import {
  ReaderEmptyState,
  ReaderSurfaceBody,
  readerSelectableItemClass
} from './ReaderSurfacePrimitives';

export function SourceLinksSurface({
  backlinks,
  entryTitle,
  linkedReaderKind,
  onLocateSource,
  onOpenNote
}: {
  backlinks: SourceBacklink[];
  entryTitle: string;
  linkedReaderKind: WorkspaceReaderSurfaceKind | null;
  onLocateSource: (segmentUid: string) => void;
  onOpenNote: (backlink: SourceBacklink) => void;
}) {
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
      <EntryContentHeader contentTitle="来源链接" entryTitle={entryTitle} />
      <ReaderSurfaceBody>
        {backlinks.length === 0 ? (
          <ReaderEmptyState
            description="在 PDF 或重排视图中复制或插入来源后，会显示在这里。"
            icon={Link2}
            title="暂无来源链接"
          />
        ) : (
          <div className="grid gap-2">
            {backlinks.map((backlink) => (
              <div
                className="flex min-w-0 items-stretch gap-2"
                key={`${backlink.linkId}:${backlink.segmentUid}`}
              >
                <button
                  className={readerSelectableItemClass}
                  type="button"
                  onClick={() => onOpenNote(backlink)}
                >
                  <div className="truncate text-sm font-medium text-foreground">
                    {backlink.noteTitle}
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {backlink.noteEntryTitle} · 原文片段 {backlink.segmentUid}
                  </div>
                </button>
                {linkedReaderKind ? (
                  <Button
                    className="shrink-0 self-center"
                    size="xs"
                    title={`在配对的${linkedReaderKind === 'pdf' ? ' PDF' : '重排视图'}中定位`}
                    type="button"
                    variant="outline"
                    onClick={() => onLocateSource(backlink.segmentUid)}
                  >
                    定位原文
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </ReaderSurfaceBody>
    </div>
  );
}
