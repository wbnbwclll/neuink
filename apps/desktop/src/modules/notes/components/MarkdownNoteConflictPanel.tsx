import { AlertTriangle, FileDown, HardDriveDownload, Save } from 'lucide-react';

import { Button } from '@/components/ui/button';

import type { MarkdownNoteConflict } from './useMarkdownNoteSession';

export function MarkdownNoteConflictPanel({
  conflict,
  saving,
  onAcceptRemote,
  onOverwriteRemote,
  onSaveAs
}: {
  conflict: MarkdownNoteConflict;
  saving: boolean;
  onAcceptRemote: () => void;
  onOverwriteRemote: () => void;
  onSaveAs: () => void;
}) {
  return (
    <aside
      aria-label="笔记版本冲突"
      className="mx-3 rounded-md border border-amber-300 bg-amber-50 text-amber-950 shadow-sm"
      role="alert"
    >
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <AlertTriangle aria-hidden="true" className="size-4 shrink-0 text-amber-700" />
        <div className="min-w-56 flex-1">
          <p className="text-sm font-semibold">检测到磁盘上的新版本</p>
          <p className="text-xs text-amber-800">自动保存已暂停。先比较两版，再决定保留哪一版。</p>
        </div>
        <Button disabled={saving} size="xs" type="button" variant="outline" onClick={onSaveAs}>
          <FileDown aria-hidden="true" />另存草稿
        </Button>
        <Button
          disabled={saving}
          size="xs"
          type="button"
          variant="outline"
          onClick={onAcceptRemote}
        >
          <HardDriveDownload aria-hidden="true" />使用磁盘版本
        </Button>
        <Button disabled={saving} size="xs" type="button" onClick={onOverwriteRemote}>
          <Save aria-hidden="true" />用当前草稿覆盖
        </Button>
      </div>
      <details className="border-t border-amber-200 px-3 py-2">
        <summary className="cursor-pointer select-none text-xs font-medium">比较两版内容</summary>
        <div className="mt-2 grid min-w-0 gap-2 lg:grid-cols-2">
          <VersionPreview
            label="磁盘最新版本"
            markdown={conflict.remote.markdown}
            title={conflict.remote.title}
          />
          <VersionPreview
            label="当前本地草稿"
            markdown={conflict.localMarkdown}
            title={conflict.localTitle}
          />
        </div>
      </details>
    </aside>
  );
}

function VersionPreview({ label, markdown, title }: { label: string; markdown: string; title: string }) {
  return (
    <section className="min-w-0 rounded border border-amber-200 bg-white p-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">{label}</p>
      <p className="mt-1 truncate text-xs font-semibold" title={title}>{title}</p>
      <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-50 p-2 font-mono text-[11px] leading-4 text-slate-700">
        {markdown || '（空白笔记）'}
      </pre>
    </section>
  );
}
