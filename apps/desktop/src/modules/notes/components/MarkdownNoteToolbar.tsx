import type { Editor } from '@tiptap/core';
import { Link2, PlusCircle } from 'lucide-react';
import type { MouseEvent } from 'react';

import { Button } from '@/components/ui/button';

import { MarkdownInlineToolbar } from './MarkdownInlineToolbar';
import { MarkdownInsertMenu } from './MarkdownInsertMenu';

export function MarkdownNoteToolbar({
  activeSourceCount,
  disabled,
  editor,
  imageBusy,
  imageDisabled,
  insertAt,
  insertMenuAnchor,
  sourcePanelOpen,
  onCloseInsertMenu,
  onInsertImage,
  onOpenInsertMenu,
  onToggleSourcePanel
}: {
  activeSourceCount: number;
  disabled: boolean;
  editor: Editor | null;
  imageBusy: boolean;
  imageDisabled: boolean;
  insertAt: number | null;
  insertMenuAnchor: { left: number; top: number } | null;
  sourcePanelOpen: boolean;
  onCloseInsertMenu: () => void;
  onInsertImage: () => void;
  onOpenInsertMenu: (event: MouseEvent<HTMLButtonElement>) => void;
  onToggleSourcePanel: () => void;
}) {
  return (
    <div
      className="markdown-note-toolbar relative mb-2 flex min-w-0 items-center gap-1 overflow-hidden rounded-md border bg-white p-1"
      data-note-editor-toolbar="true"
    >
      <MarkdownInlineToolbar disabled={disabled} editor={editor} />
      <MarkdownInsertMenu
        anchor={insertMenuAnchor}
        disabled={disabled}
        editor={editor}
        imageDisabled={imageDisabled}
        imageBusy={imageBusy}
        insertAt={insertAt}
        shouldDeleteTrigger={false}
        onClose={onCloseInsertMenu}
        onInsertImage={onInsertImage}
      />
      <Button
        aria-label="插入块"
        className="markdown-note-insert-button h-7"
        disabled={disabled || !editor}
        size="sm"
        title="插入块"
        type="button"
        variant="ghost"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onOpenInsertMenu}
      >
        <PlusCircle size={13} aria-hidden="true" />
        <span className="markdown-note-insert-label">插入</span>
      </Button>
      {activeSourceCount > 0 ? (
        <Button
          aria-expanded={sourcePanelOpen}
          className="ml-auto h-7 gap-1 px-1.5 text-[11px]"
          size="sm"
          title={sourcePanelOpen ? '收起来源' : `展开 ${activeSourceCount} 个来源`}
          type="button"
          variant={sourcePanelOpen ? 'secondary' : 'ghost'}
          onClick={onToggleSourcePanel}
        >
          <Link2 size={12} aria-hidden="true" />
          {activeSourceCount}
          <span className="sr-only">{sourcePanelOpen ? '收起来源' : '展开来源'}</span>
        </Button>
      ) : null}
    </div>
  );
}
