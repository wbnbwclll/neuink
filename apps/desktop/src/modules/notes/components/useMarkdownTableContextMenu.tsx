import type { Editor } from '@tiptap/core';
import { Plus, Rows3, Trash2 } from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode
} from 'react';

import { cn } from '@/lib/utils';

import { findTableFromTarget, focusTableAt, tableAnchorPos } from './markdownNoteEditorSupport';

export type TableCommand =
  | 'addColumnAfter'
  | 'addColumnBefore'
  | 'addRowAfter'
  | 'addRowBefore'
  | 'deleteColumn'
  | 'deleteRow'
  | 'deleteTable';

export type TableContextMenuState = {
  anchorPos: number;
  left: number;
  top: number;
};

export function runMarkdownTableCommand(
  editor: Editor,
  command: TableCommand,
  anchorPos: number
) {
  focusTableAt(editor, anchorPos);
  const chain = editor.chain().focus();
  switch (command) {
    case 'addColumnBefore':
      return chain.addColumnBefore().run();
    case 'addColumnAfter':
      return chain.addColumnAfter().run();
    case 'addRowBefore':
      return chain.addRowBefore().run();
    case 'addRowAfter':
      return chain.addRowAfter().run();
    case 'deleteColumn':
      return chain.deleteColumn().run();
    case 'deleteRow':
      return chain.deleteRow().run();
    case 'deleteTable':
      return chain.deleteTable().run();
  }
}

export function useMarkdownTableContextMenu({
  canEdit,
  editor,
  loadFailed
}: {
  canEdit: boolean;
  editor: Editor | null;
  loadFailed: boolean;
}) {
  const [tableContextMenu, setTableContextMenu] = useState<TableContextMenuState | null>(null);
  const tableContextMenuRef = useRef<HTMLDivElement | null>(null);
  const contextTableAnchorPosRef = useRef<number | null>(null);

  const closeTableContextMenu = () => {
    setTableContextMenu(null);
    contextTableAnchorPosRef.current = null;
  };

  const runTableCommand = (
    command: TableCommand,
    anchorPos = tableContextMenu?.anchorPos ?? contextTableAnchorPosRef.current
  ) => {
    if (!editor || !canEdit || loadFailed || anchorPos === null) {
      return;
    }
    runMarkdownTableCommand(editor, command, anchorPos);
    closeTableContextMenu();
  };

  const handleEditorContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    if (!editor || !canEdit || loadFailed) {
      closeTableContextMenu();
      return;
    }

    const table = findTableFromTarget(event.target);
    if (!table) {
      closeTableContextMenu();
      return;
    }

    event.preventDefault();
    const anchorPos = tableAnchorPos(editor, table, event.clientX, event.clientY);
    if (anchorPos === null) {
      closeTableContextMenu();
      return;
    }

    contextTableAnchorPosRef.current = anchorPos;
    setTableContextMenu({
      anchorPos,
      left: event.clientX,
      top: event.clientY
    });
  };

  const handleEditorMouseDownCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button === 2 && editor && findTableFromTarget(event.target)) {
      event.preventDefault();
    }
  };

  useEffect(() => {
    if (!tableContextMenu) {
      return undefined;
    }

    const closeFromPointer = (event: PointerEvent) => {
      if (
        tableContextMenuRef.current &&
        event.target instanceof Node &&
        tableContextMenuRef.current.contains(event.target)
      ) {
        return;
      }
      closeTableContextMenu();
    };
    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeTableContextMenu();
      }
    };

    window.addEventListener('pointerdown', closeFromPointer);
    window.addEventListener('keydown', closeFromKeyboard);
    return () => {
      window.removeEventListener('pointerdown', closeFromPointer);
      window.removeEventListener('keydown', closeFromKeyboard);
    };
  }, [tableContextMenu]);

  return {
    handleEditorContextMenu,
    handleEditorMouseDownCapture,
    runTableCommand,
    tableContextMenu,
    tableContextMenuRef
  };
}

export const TableContextMenu = forwardRef<
  HTMLDivElement,
  {
    left: number;
    onRun: (command: TableCommand) => void;
    top: number;
  }
>(function TableContextMenu({ left, onRun, top }, ref) {
  const menuWidth = 208;
  const menuMaxHeight = Math.min(320, window.innerHeight - 16);
  const menuMargin = 8;
  const style: CSSProperties = {
    left: Math.max(menuMargin, Math.min(left, window.innerWidth - menuWidth - menuMargin)),
    maxHeight: menuMaxHeight,
    top: Math.max(menuMargin, Math.min(top, window.innerHeight - menuMaxHeight - menuMargin))
  };

  return (
    <div
      ref={ref}
      className="fixed z-50 w-52 overflow-y-auto rounded-md border border-slate-200 bg-popover p-1 text-sm text-popover-foreground shadow-md"
      role="menu"
      style={style}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">表格</div>
      <TableContextMenuButton icon={<Plus size={14} aria-hidden="true" />} onClick={() => onRun('addColumnBefore')}>
        左侧增加列
      </TableContextMenuButton>
      <TableContextMenuButton icon={<Plus size={14} aria-hidden="true" />} onClick={() => onRun('addColumnAfter')}>
        右侧增加列
      </TableContextMenuButton>
      <TableContextMenuButton icon={<Rows3 size={14} aria-hidden="true" />} onClick={() => onRun('addRowBefore')}>
        上方增加行
      </TableContextMenuButton>
      <TableContextMenuButton icon={<Rows3 size={14} aria-hidden="true" />} onClick={() => onRun('addRowAfter')}>
        下方增加行
      </TableContextMenuButton>
      <TableContextMenuSeparator />
      <TableContextMenuButton icon={<Trash2 size={14} aria-hidden="true" />} onClick={() => onRun('deleteColumn')}>
        删除列
      </TableContextMenuButton>
      <TableContextMenuButton icon={<Trash2 size={14} aria-hidden="true" />} onClick={() => onRun('deleteRow')}>
        删除行
      </TableContextMenuButton>
      <TableContextMenuButton
        destructive
        icon={<Trash2 size={14} aria-hidden="true" />}
        onClick={() => onRun('deleteTable')}
      >
        删除表格
      </TableContextMenuButton>
    </div>
  );
});

function TableContextMenuButton({
  children,
  destructive = false,
  disabled = false,
  icon,
  onClick
}: {
  children: string;
  destructive?: boolean;
  disabled?: boolean;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        'flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-sm outline-none transition hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-45',
        destructive && 'text-destructive hover:bg-destructive/10 hover:text-destructive'
      )}
      disabled={disabled}
      role="menuitem"
      type="button"
      onClick={onClick}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
}

function TableContextMenuSeparator() {
  return <div className="-mx-1 my-1 h-px bg-border" role="separator" />;
}
