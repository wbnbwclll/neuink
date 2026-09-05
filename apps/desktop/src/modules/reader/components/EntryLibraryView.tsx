import {
  AlertTriangle,
  ChevronRight,
  Columns3,
  Eye,
  FilePlus2,
  FilterX,
  Folder,
  FolderOpen,
  PanelRight,
  RefreshCw,
  RotateCcw,
  Search,
  Table2,
  Trash2
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from 'react';
import { createPortal } from 'react-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TabsContent } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { listReadingStates } from '@/shared/ipc/workspaceApi';
import {
  beginEntryTagDrag,
  cancelEntryTagDrag,
  finishEntryTagDrag,
  getEntryTagDragState,
  isEntryTagDropTargetActive,
  registerEntryTagDropTarget,
  subscribeEntryTagDrag,
  updateEntryTagDrag
} from '@/shared/lib/entryDragData';
import type { EntryReadingState, TagMeta, TrashItem } from '@/shared/types/domain';
import { useToast } from '@/shared/hooks/useToast';
import { subscribeReadingStateUpdated } from '@/shared/lib/readingStateEvents';

import type { LibraryEntry, LibraryView } from '../../library/components/LibrarySidebar';
import {
  buildTagPathById,
  buildTagTree,
  collectDescendantTagIds,
  flattenTagTree,
  type TagNode
} from '../../library/utils/tagTree';
import { EntryActionDialog } from './EntryActionDialog';
import { AssetSummary, StatusBadge, TagBadges, formatDate } from './EntryDisplay';
import { TrashItemsView } from './TrashItemsView';

type EntryLibraryViewProps = {
  activeTag: string | null;
  entries: LibraryEntry[];
  trashedEntries: LibraryEntry[];
  trashItems: TrashItem[];
  isRefreshingParseStatus: boolean;
  libraryView: LibraryView;
  filterResetKey: number;
  recentReadingEntryIds: string[];
  selectedEntryId: string | null;
  status: 'loading' | 'ready' | 'error';
  tags: TagMeta[];
  workspaceRoot: string | null;
  onDeleteEntry: (entryId: string) => Promise<void> | void;
  onOpenCreateEntryTab: () => void;
  onOpenEntryExplorer: (entryId: string) => void;
  onOpenEntryInSidePane: (entryId: string) => void;
  onPurgeEntry: (entryId: string) => Promise<void> | void;
  onPurgeTrashItem: (entryId: string, trashId: string) => Promise<void> | void;
  onRefreshParseStatus: () => Promise<void> | void;
  onReparseEntry: (entryId: string) => Promise<void> | void;
  onRestoreEntry: (entryId: string) => Promise<void> | void;
  onRestoreTrashItem: (entryId: string, trashId: string) => Promise<void> | void;
  onSelectEntry: (id: string) => void;
  onSelectTag: (tag: string | null) => void;
  onUpdateEntry: (
    entryId: string,
    request: { fields: Record<string, string>; tagPaths: string[]; title: string }
  ) => Promise<unknown> | unknown;
  standalone?: boolean;
};

type EntryLibraryLayout = 'table' | 'tag-folders';
type EntryLibraryColumnId =
  | 'title'
  | 'reading-progress'
  | 'last-read'
  | 'reading-time'
  | 'tags'
  | 'file'
  | 'parser'
  | 'updated'
  | 'actions';

const ENTRY_LIBRARY_LAYOUT_STORAGE_KEY = 'neuink.entryLibraryLayout';
const ENTRY_LIBRARY_COLUMNS_STORAGE_KEY = 'neuink.entryLibraryColumns.v1';
const ENTRY_LIBRARY_COLUMNS: Array<{
  id: EntryLibraryColumnId;
  label: string;
  width: string;
}> = [
  { id: 'title', label: '标题', width: 'w-[240px]' },
  { id: 'reading-progress', label: '阅读进度', width: 'w-[180px]' },
  { id: 'last-read', label: '最近阅读', width: 'w-[130px]' },
  { id: 'reading-time', label: '阅读时长', width: 'w-[120px]' },
  { id: 'tags', label: '标签', width: 'w-[190px]' },
  { id: 'file', label: '文件', width: 'w-[120px]' },
  { id: 'parser', label: '解析器', width: 'w-[120px]' },
  { id: 'updated', label: '更新时间', width: 'w-[130px]' },
  { id: 'actions', label: '操作', width: 'w-[90px]' }
];

export function EntryLibraryView({
  activeTag,
  entries,
  trashedEntries,
  trashItems,
  isRefreshingParseStatus,
  libraryView,
  filterResetKey,
  recentReadingEntryIds,
  selectedEntryId,
  status,
  tags,
  workspaceRoot,
  onDeleteEntry,
  onOpenCreateEntryTab,
  onOpenEntryExplorer,
  onOpenEntryInSidePane,
  onPurgeEntry,
  onPurgeTrashItem,
  onRefreshParseStatus,
  onReparseEntry,
  onRestoreEntry,
  onRestoreTrashItem,
  onSelectEntry,
  onSelectTag,
  onUpdateEntry,
  standalone = false
}: EntryLibraryViewProps) {
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState('recent');
  const [layout, setLayout] = useState<EntryLibraryLayout>(readStoredEntryLibraryLayout);
  const [visibleColumns, setVisibleColumns] = useState<Set<EntryLibraryColumnId>>(readStoredEntryLibraryColumns);
  const [readingStates, setReadingStates] = useState<Record<string, EntryReadingState>>({});
  const [dialog, setDialog] = useState<{ action: 'move-to-trash' | 'purge'; entry: LibraryEntry } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [draggingEntryId, setDraggingEntryId] = useState<string | null>(null);
  const [entryDragPreview, setEntryDragPreview] = useState<{ title: string; x: number; y: number } | null>(null);
  const entryDragRef = useRef<{ dragging: boolean; entryId: string; pointerId: number; startX: number; startY: number } | null>(null);
  const suppressEntryClickRef = useRef(false);
  const [emptyTrashConfirmOpen, setEmptyTrashConfirmOpen] = useState(false);
  const [emptyTrashBusy, setEmptyTrashBusy] = useState(false);
  const { notify } = useToast();
  const isTrashView = libraryView === 'trash';
  useEffect(() => {
    if (!workspaceRoot || isTrashView) {
      return;
    }
    let cancelled = false;
    void listReadingStates(workspaceRoot)
      .then((states) => {
        if (!cancelled) {
          setReadingStates(Object.fromEntries(states.map((state) => [state.entry_id, state])));
        }
      })
      .catch(() => undefined);
    const unsubscribe = subscribeReadingStateUpdated((state) => {
      setReadingStates((current) => ({ ...current, [state.entry_id]: state }));
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [isTrashView, workspaceRoot]);
  useEffect(() => {
    setQuery('');
    setSortBy('recent');
  }, [filterResetKey]);
  const visibleEntries = isTrashView ? trashedEntries : entries;
  const tagPathById = useMemo(() => buildTagPathById(tags), [tags]);
  const activeTagIds = useMemo(
    () => (activeTag ? collectDescendantTagIds(tags, activeTag) : null),
    [activeTag, tags]
  );
  const entriesInCurrentView = useMemo(
    () => filterEntries(visibleEntries, libraryView, null, query, sortBy, recentReadingEntryIds, readingStates),
    [libraryView, query, readingStates, recentReadingEntryIds, sortBy, visibleEntries]
  );
  const filteredEntries = useMemo(
    () => filterEntries(visibleEntries, libraryView, activeTagIds, query, sortBy, recentReadingEntryIds, readingStates),
    [activeTagIds, libraryView, query, readingStates, recentReadingEntryIds, sortBy, visibleEntries]
  );
  const tagTree = useMemo(() => buildTagTree(tags, entriesInCurrentView), [entriesInCurrentView, tags]);
  const currentFolderNode = useMemo(
    () => activeTag ? flattenTagTree(tagTree).find((node) => node.id === activeTag) ?? null : null,
    [activeTag, tagTree]
  );
  const visibleFolderNodes = currentFolderNode?.children ?? tagTree;
  const folderBreadcrumb = useMemo(() => buildTagBreadcrumb(tags, activeTag), [activeTag, tags]);
  const tagUpdatedAtById = useMemo(() => new Map(tags.map((tag) => [tag.id, tag.updated_at])), [tags]);
  const folderEntries = useMemo(() => {
    if (query.trim()) {
      return filteredEntries;
    }
    return activeTag
      ? entriesInCurrentView.filter((item) => item.tagIds.includes(activeTag))
      : entriesInCurrentView.filter((item) => item.tagIds.length === 0);
  }, [activeTag, entriesInCurrentView, filteredEntries, query]);
  const activeJobs = entries.filter((item) => ['Queued', 'Uploading', 'Parsing'].includes(item.status)).length;
  const activeTagLabel = activeTag ? tagPathById.get(activeTag) ?? activeTag : null;
  const headCellClass = 'h-7 border-r border-border bg-muted px-2 text-center text-[11px] font-semibold last:border-r-0';
  const bodyCellClass = 'h-9 border-r border-border px-2 py-1 align-middle last:border-r-0';
  const centeredContentClass = 'flex min-w-0 items-center justify-center';
  const readingOverview = useMemo(
    () => buildReadingOverview(layout === 'tag-folders' ? folderEntries : filteredEntries, readingStates),
    [filteredEntries, folderEntries, layout, readingStates]
  );
  const shownColumns = ENTRY_LIBRARY_COLUMNS.filter((column) => visibleColumns.has(column.id));

  const toggleColumn = (columnId: EntryLibraryColumnId, visible: boolean) => {
    setVisibleColumns((current) => {
      const next = new Set(current);
      if (visible) {
        next.add(columnId);
      } else if (next.size > 1) {
        next.delete(columnId);
      }
      window.localStorage.setItem(ENTRY_LIBRARY_COLUMNS_STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const confirmEntryAction = async () => {
    if (!dialog) {
      return;
    }
    setActionBusy(true);
    try {
      if (dialog.action === 'purge') {
        await onPurgeEntry(dialog.entry.id);
      } else {
        await onDeleteEntry(dialog.entry.id);
      }
      setDialog(null);
    } catch {
      // The workspace hook owns the user-facing error state.
    } finally {
      setActionBusy(false);
    }
  };

  const confirmEmptyTrash = async () => {
    if (trashItems.length === 0) {
      setEmptyTrashConfirmOpen(false);
      return;
    }
    setEmptyTrashBusy(true);
    try {
      for (const item of trashItems.filter((item) => item.kind === 'entry')) {
        await onPurgeEntry(item.entry_id);
      }
      for (const item of trashItems.filter((item) => item.kind !== 'entry' && item.restorable)) {
        await onPurgeTrashItem(item.entry_id, item.trash_id);
      }
      setEmptyTrashConfirmOpen(false);
    } catch {
      // The workspace hook owns the user-facing error state.
    } finally {
      setEmptyTrashBusy(false);
    }
  };

  const openEntryDetails = (entryId: string) => {
    onSelectEntry(entryId);
    onOpenEntryExplorer(entryId);
  };

  const changeLayout = (nextLayout: EntryLibraryLayout) => {
    setLayout(nextLayout);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ENTRY_LIBRARY_LAYOUT_STORAGE_KEY, nextLayout);
    }
  };

  const assignEntryToTag = (entryId: string, tagPath: string) => {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry || entry.tags.includes(tagPath)) {
      return;
    }
    return onUpdateEntry(entry.id, {
      fields: entry.fields,
      tagPaths: [...entry.tags, tagPath],
      title: entry.title
    });
  };

  const cancelEntryDrag = () => {
    cancelEntryTagDrag();
    entryDragRef.current = null;
    setDraggingEntryId(null);
    setEntryDragPreview(null);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  const entryDragHandlers = (item: LibraryEntry) => ({
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => {
      if (entryDragRef.current?.pointerId === event.pointerId) {
        cancelEntryDrag();
      }
    },
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 || (event.target instanceof Element && event.target.closest('button'))) {
        return;
      }
      entryDragRef.current = {
        dragging: false,
        entryId: item.id,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      const drag = entryDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }
      if (!drag.dragging) {
        const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
        if (distance < 6) {
          return;
        }
        drag.dragging = true;
        suppressEntryClickRef.current = true;
        beginEntryTagDrag(drag.entryId, event.clientX, event.clientY);
        setDraggingEntryId(drag.entryId);
        setEntryDragPreview({ title: item.title, x: event.clientX, y: event.clientY });
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
      } else {
        updateEntryTagDrag(event.clientX, event.clientY);
        setEntryDragPreview((current) => current ? { ...current, x: event.clientX, y: event.clientY } : current);
      }
      event.preventDefault();
    },
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
      const drag = entryDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }
      if (drag.dragging) {
        finishEntryTagDrag(event.clientX, event.clientY);
      }
      entryDragRef.current = null;
      setDraggingEntryId(null);
      setEntryDragPreview(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    }
  });

  const content = (
    <>
      <div className={cn('grid h-full min-h-0 gap-3', standalone && 'min-w-[760px]')}>
        <Card className="min-h-0 rounded-none py-0">
          <CardHeader className="border-b py-2.5">
            <CardTitle>{isTrashView ? '回收站' : '条目库'}</CardTitle>
            <CardAction>
              {!isTrashView ? (
                <div className="flex items-center gap-2">
                  <ToggleGroup
                    aria-label="条目库视图"
                    className="rounded-md border bg-muted p-0.5"
                    size="sm"
                    spacing={0}
                    type="single"
                    value={layout}
                    variant="default"
                    onValueChange={(value) => {
                      if (value === 'table' || value === 'tag-folders') {
                        changeLayout(value);
                      }
                    }}
                  >
                    <ToggleGroupItem
                      aria-label="列表视图"
                      className={cn('h-7 px-2 text-[11px]', layout === 'table' ? 'bg-background shadow-sm hover:bg-background' : 'text-muted-foreground')}
                      title="列表视图"
                      value="table"
                    >
                      <Table2 size={13} aria-hidden="true" />
                      列表
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      aria-label="标签文件夹视图"
                      className={cn('h-7 px-2 text-[11px]', layout === 'tag-folders' ? 'bg-background shadow-sm hover:bg-background' : 'text-muted-foreground')}
                      title="把标签层级作为虚拟文件夹浏览"
                      value="tag-folders"
                    >
                      <FolderOpen size={13} aria-hidden="true" />
                      标签文件夹
                    </ToggleGroupItem>
                  </ToggleGroup>
                  <Button size="sm" type="button" onClick={onOpenCreateEntryTab}>
                    <FilePlus2 size={15} aria-hidden="true" />
                    创建条目
                  </Button>
                </div>
              ) : (
                <Button
                  disabled={trashItems.length === 0 || emptyTrashBusy}
                  size="sm"
                  type="button"
                  variant="destructive"
                  onClick={() => setEmptyTrashConfirmOpen(true)}
                >
                  <Trash2 size={15} aria-hidden="true" />
                  清空回收站
                </Button>
              )}
            </CardAction>
          </CardHeader>
          {!isTrashView ? <CardContent className="py-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="relative min-w-72 flex-1">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-8 pl-8 text-xs"
                  placeholder={isTrashView ? '搜索回收站条目' : '搜索标题、PDF、字段、标签或解析状态'}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="h-8 w-40 text-xs">
                  <SelectValue placeholder="排序" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">最近更新</SelectItem>
                  <SelectItem value="title">标题</SelectItem>
                  <SelectItem value="parser">解析状态</SelectItem>
                  <SelectItem value="reading-progress">阅读进度</SelectItem>
                  <SelectItem value="last-read">最近阅读</SelectItem>
                  <SelectItem value="reading-time">阅读时长</SelectItem>
                </SelectContent>
              </Select>
              {layout === 'table' ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" type="button" variant="outline">
                      <Columns3 size={14} aria-hidden="true" />
                      表头
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuLabel>显示的列</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {ENTRY_LIBRARY_COLUMNS.map((column) => (
                      <DropdownMenuCheckboxItem
                        checked={visibleColumns.has(column.id)}
                        key={column.id}
                        onCheckedChange={(checked) => toggleColumn(column.id, checked === true)}
                        onSelect={(event) => event.preventDefault()}
                      >
                        {column.label}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
              <Button size="sm" type="button" variant="outline" onClick={() => setQuery('')}>
                <FilterX size={14} aria-hidden="true" />
                清除
              </Button>
              {libraryView === 'parsing' ? (
                <Button
                  disabled={activeJobs === 0 || isRefreshingParseStatus}
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => void onRefreshParseStatus()}
                >
                  <RefreshCw className={cn(isRefreshingParseStatus && 'animate-spin')} size={14} aria-hidden="true" />
                  刷新
                </Button>
              ) : null}
              {activeTagLabel ? <Badge variant="secondary">标签：{activeTagLabel}</Badge> : null}
            </div>
          </CardContent> : null}

          {!isTrashView ? <ReadingOverview overview={readingOverview} /> : null}

          {isTrashView ? (
            <div className="p-3">
              <TrashItemsView
                fixedHeight
                items={trashItems}
                onPurgeEntry={onPurgeEntry}
                onPurgeItem={onPurgeTrashItem}
                onRestoreEntry={onRestoreEntry}
                onRestoreItem={onRestoreTrashItem}
              />
            </div>
          ) : layout === 'tag-folders' ? (
            <div className="flex min-h-0 flex-1 flex-col border border-border bg-white">
              <div className="flex min-h-9 items-center justify-between gap-3 border-b bg-muted/20 px-2">
                <nav aria-label="标签文件夹路径" className="flex min-w-0 items-center gap-0.5 text-xs">
                  <button
                    className={cn(
                      'rounded-sm px-1.5 py-1 transition-colors hover:bg-muted',
                      !activeTag ? 'font-semibold text-foreground' : 'text-muted-foreground'
                    )}
                    type="button"
                    onClick={() => onSelectTag(null)}
                  >
                    标签根目录
                  </button>
                  {folderBreadcrumb.map((folder) => (
                    <span className="flex min-w-0 items-center gap-1" key={folder.id}>
                      <ChevronRight className="shrink-0 text-muted-foreground" size={13} aria-hidden="true" />
                      <button
                        className={cn(
                          'max-w-48 truncate rounded-sm px-1.5 py-1 transition-colors hover:bg-muted',
                          folder.id === activeTag ? 'font-semibold text-foreground' : 'text-muted-foreground'
                        )}
                        title={tagPathById.get(folder.id) ?? folder.name}
                        type="button"
                        onClick={() => onSelectTag(folder.id)}
                      >
                        {folder.name}
                      </button>
                    </span>
                  ))}
                </nav>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {visibleFolderNodes.length} 个文件夹 · {folderEntries.length} 个条目
                </span>
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                <div className="min-w-[920px] text-xs" role="table" aria-label="标签文件夹内容">
                  <div
                    className="sticky top-0 z-10 grid h-7 grid-cols-[minmax(280px,2fr)_110px_minmax(190px,1.2fr)_150px_110px_34px] items-center border-b bg-muted font-semibold text-foreground"
                    role="row"
                  >
                    <div className="px-2" role="columnheader">名称</div>
                    <div className="px-2" role="columnheader">类型</div>
                    <div className="px-2" role="columnheader">标签 / 内容</div>
                    <div className="px-2" role="columnheader">阅读</div>
                    <div className="px-2" role="columnheader">修改日期</div>
                    <span aria-hidden="true" />
                  </div>
                  <div role="rowgroup">
                    {visibleFolderNodes.map((node) => (
                      <TagFolderTile
                        key={node.id}
                        node={node}
                        updatedAt={tagUpdatedAtById.get(node.id) ?? null}
                        onAssignEntryToTag={assignEntryToTag}
                        onOpen={() => onSelectTag(node.id)}
                      />
                    ))}
                    {status === 'loading' ? (
                      <div className="border-b px-3 py-8 text-center text-sm text-muted-foreground">正在打开条目库...</div>
                    ) : null}
                    {folderEntries.map((item) => (
                      <ContextMenu key={item.id}>
                        <HoverCard closeDelay={100} openDelay={350}>
                          <ContextMenuTrigger asChild>
                            <HoverCardTrigger asChild>
                              <div
                                className={cn(
                                  'group grid min-h-10 cursor-pointer grid-cols-[minmax(280px,2fr)_110px_minmax(190px,1.2fr)_150px_110px_34px] items-center border-b transition-colors hover:bg-accent/55',
                                  item.id === selectedEntryId && 'bg-accent/70',
                                  item.id === draggingEntryId && 'opacity-55'
                                )}
                                data-allow-context-menu="true"
                                role="row"
                                tabIndex={0}
                                {...entryDragHandlers(item)}
                                onClick={() => {
                                  if (suppressEntryClickRef.current) {
                                    suppressEntryClickRef.current = false;
                                    return;
                                  }
                                  openEntryDetails(item.id);
                                }}
                                onContextMenu={() => onSelectEntry(item.id)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    openEntryDetails(item.id);
                                  }
                                }}
                              >
                                <div className="min-w-0 px-2 py-1" role="cell">
                                  <div className="truncate font-medium">{item.title}</div>
                                  <div className="truncate text-[11px] text-muted-foreground">{item.pdfFileName || '无 PDF 文件'}</div>
                                </div>
                                <div className="px-2 text-muted-foreground" role="cell">{item.pdfFileName ? 'PDF 文献' : '条目'}</div>
                                <div className="truncate px-2 text-muted-foreground" role="cell">{formatCompactTags(item.tags)}</div>
                                <div className="px-2 tabular-nums text-muted-foreground" role="cell">{formatReadingSummary(readingStates[item.id])}</div>
                                <div className="px-2 tabular-nums text-muted-foreground" role="cell">{formatDate(item.updatedAt)}</div>
                                <div className="pr-1" role="cell">
                                  <Button
                                    className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                                    size="icon-xs"
                                    title="在右侧打开"
                                    type="button"
                                    variant="ghost"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      onOpenEntryInSidePane(item.id);
                                    }}
                                  >
                                    <PanelRight size={13} aria-hidden="true" />
                                  </Button>
                                </div>
                              </div>
                            </HoverCardTrigger>
                          </ContextMenuTrigger>
                          <HoverCardContent align="start" className="w-96" side="right">
                            <EntryFolderHoverDetails entry={item} readingState={readingStates[item.id]} />
                          </HoverCardContent>
                        </HoverCard>
                        <ContextMenuContent className="w-44" data-allow-context-menu="true">
                          <ContextMenuLabel className="truncate">{item.title}</ContextMenuLabel>
                          <ContextMenuSeparator />
                          <ContextMenuItem onSelect={() => openEntryDetails(item.id)}>
                            <Eye size={13} aria-hidden="true" />
                            查看详情
                          </ContextMenuItem>
                          <ContextMenuItem onSelect={() => onOpenEntryInSidePane(item.id)}>
                            <PanelRight size={13} aria-hidden="true" />
                            在右侧打开
                          </ContextMenuItem>
                          {item.status === 'Parsed' || item.status === 'Failed' ? (
                            <ContextMenuItem
                              disabled={activeJobs > 0}
                              onSelect={() => {
                                void Promise.resolve(onReparseEntry(item.id))
                                  .then(() => notify({
                                    title: '已重新提交解析',
                                    description: `${item.title} 已重新加入解析队列，解析结果会覆盖现有内容。`
                                  }))
                                  .catch(() => undefined);
                              }}
                            >
                              <RotateCcw size={13} aria-hidden="true" />
                              重新解析
                            </ContextMenuItem>
                          ) : null}
                          <ContextMenuItem variant="destructive" onSelect={() => setDialog({ action: 'move-to-trash', entry: item })}>
                            <Trash2 size={13} aria-hidden="true" />
                            移到回收站
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    ))}
                    {status !== 'loading' && visibleFolderNodes.length === 0 && folderEntries.length === 0 ? (
                      <div className="px-3 py-10 text-center text-sm text-muted-foreground">
                        此文件夹为空。拖动条目到左侧标签或其他文件夹即可归类。
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ) : (
          <div className="entry-library-table-shell min-h-0 min-w-0 flex-1 border border-border [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto">
          <Table className="w-max min-w-full table-fixed border-collapse">
            <colgroup>
              {shownColumns.map((column) => <col className={column.width} key={column.id} />)}
            </colgroup>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                {shownColumns.map((column) => (
                  <TableHead className={cn(headCellClass, column.id === 'title' && 'text-left')} key={column.id}>
                    {column.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody className="[&_tr:last-child]:!border-b">
              {status === 'loading' ? (
                <TableRow>
                  <TableCell className="py-8 text-center text-muted-foreground" colSpan={shownColumns.length}>
                    正在打开条目库...
                  </TableCell>
                </TableRow>
              ) : null}
              {status !== 'loading' && filteredEntries.length === 0 ? (
                <TableRow>
                  <TableCell className="py-8 text-center text-muted-foreground" colSpan={shownColumns.length}>
                    {isTrashView ? '回收站为空。' : '没有符合当前筛选条件的条目。'}
                  </TableCell>
                </TableRow>
              ) : null}
              {filteredEntries.map((item) => (
                <ContextMenu key={item.id}>
                  <ContextMenuTrigger asChild>
                    <TableRow
                      className={cn(
                        !isTrashView && 'cursor-pointer',
                        item.id === selectedEntryId && !isTrashView && 'bg-accent/70',
                        item.id === draggingEntryId && 'opacity-55'
                      )}
                      data-allow-context-menu="true"
                      title={!isTrashView ? '拖动到左侧标签以添加标签' : undefined}
                      onClick={() => {
                        if (suppressEntryClickRef.current) {
                          suppressEntryClickRef.current = false;
                          return;
                        }
                        if (!isTrashView) {
                          openEntryDetails(item.id);
                        }
                      }}
                      onContextMenu={() => {
                        if (!isTrashView) {
                          onSelectEntry(item.id);
                        }
                      }}
                      onPointerCancel={(event) => {
                        if (entryDragRef.current?.pointerId !== event.pointerId) {
                          return;
                        }
                        cancelEntryTagDrag();
                        entryDragRef.current = null;
                        setDraggingEntryId(null);
                        setEntryDragPreview(null);
                        document.body.style.cursor = '';
                        document.body.style.userSelect = '';
                      }}
                      onPointerDown={(event) => {
                        if (isTrashView || event.button !== 0 || (event.target instanceof Element && event.target.closest('button'))) {
                          return;
                        }
                        entryDragRef.current = {
                          dragging: false,
                          entryId: item.id,
                          pointerId: event.pointerId,
                          startX: event.clientX,
                          startY: event.clientY
                        };
                        event.currentTarget.setPointerCapture(event.pointerId);
                      }}
                      onPointerMove={(event) => {
                        const drag = entryDragRef.current;
                        if (!drag || drag.pointerId !== event.pointerId) {
                          return;
                        }
                        if (!drag.dragging) {
                          const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
                          if (distance < 6) {
                            return;
                          }
                          drag.dragging = true;
                          suppressEntryClickRef.current = true;
                          beginEntryTagDrag(drag.entryId, event.clientX, event.clientY);
                          setDraggingEntryId(drag.entryId);
                          setEntryDragPreview({ title: item.title, x: event.clientX, y: event.clientY });
                          document.body.style.cursor = 'grabbing';
                          document.body.style.userSelect = 'none';
                        } else {
                          updateEntryTagDrag(event.clientX, event.clientY);
                          setEntryDragPreview((current) => current ? { ...current, x: event.clientX, y: event.clientY } : current);
                        }
                        event.preventDefault();
                      }}
                      onPointerUp={(event) => {
                        const drag = entryDragRef.current;
                        if (!drag || drag.pointerId !== event.pointerId) {
                          return;
                        }
                        if (drag.dragging) {
                          finishEntryTagDrag(event.clientX, event.clientY);
                        }
                        entryDragRef.current = null;
                        setDraggingEntryId(null);
                        setEntryDragPreview(null);
                        document.body.style.cursor = '';
                        document.body.style.userSelect = '';
                        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                          event.currentTarget.releasePointerCapture(event.pointerId);
                        }
                      }}
                    >
                      {visibleColumns.has('title') ? <TableCell className={cn(bodyCellClass, 'text-left')}>
                        <div className="max-w-[220px] min-w-0">
                          <div className="truncate text-sm font-medium" title={item.title}>{item.title}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {item.fields.description || item.pdfFileName || '暂无描述'}
                          </div>
                        </div>
                      </TableCell> : null}
                      {visibleColumns.has('reading-progress') ? <TableCell className={bodyCellClass}>
                        <ReadingProgressCell state={readingStates[item.id]} />
                      </TableCell> : null}
                      {visibleColumns.has('last-read') ? <TableCell className={cn(bodyCellClass, 'text-center text-xs text-muted-foreground')}>
                        {formatLastRead(readingStates[item.id]?.last_read_at)}
                      </TableCell> : null}
                      {visibleColumns.has('reading-time') ? <TableCell className={cn(bodyCellClass, 'text-center text-xs tabular-nums')}>
                        {formatReadingDuration(readingStates[item.id]?.total_active_ms ?? 0)}
                      </TableCell> : null}
                      {visibleColumns.has('tags') ? <TableCell className={cn(bodyCellClass, 'min-w-0 overflow-hidden')}>
                        <div className={cn(centeredContentClass, 'w-full max-w-full overflow-hidden')}>
                          <TagBadges tags={item.tags} />
                        </div>
                      </TableCell> : null}
                      {visibleColumns.has('file') ? <TableCell className={bodyCellClass}>
                        <div className={centeredContentClass}>
                          <AssetSummary entry={item} />
                        </div>
                      </TableCell> : null}
                      {visibleColumns.has('parser') ? <TableCell className={bodyCellClass}>
                        <div className={centeredContentClass}>
                          <StatusBadge status={item.status} />
                        </div>
                      </TableCell> : null}
                      {visibleColumns.has('updated') ? <TableCell className={cn(bodyCellClass, 'text-center text-muted-foreground')}>
                        {formatDate(item.updatedAt)}
                      </TableCell> : null}
                      {visibleColumns.has('actions') ? <TableCell className={bodyCellClass}>
                        <div className={cn(centeredContentClass, 'gap-1')}>
                          {isTrashView ? (
                            <>
                              <Button
                                size="icon-xs"
                                title="恢复"
                                type="button"
                                variant="outline"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void onRestoreEntry(item.id);
                                }}
                              >
                                <RotateCcw size={14} aria-hidden="true" />
                              </Button>
                              <Button
                                size="icon-xs"
                                title="彻底删除"
                                type="button"
                                variant="destructive"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setDialog({ action: 'purge', entry: item });
                                }}
                              >
                                <Trash2 size={14} aria-hidden="true" />
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="icon-xs"
                              title="移到回收站"
                              type="button"
                              variant="destructive"
                              onClick={(event) => {
                                event.stopPropagation();
                                setDialog({ action: 'move-to-trash', entry: item });
                              }}
                            >
                              <Trash2 size={14} aria-hidden="true" />
                            </Button>
                          )}
                        </div>
                      </TableCell> : null}
                    </TableRow>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-44" data-allow-context-menu="true">
                    <ContextMenuLabel className="truncate">{item.title}</ContextMenuLabel>
                    <ContextMenuSeparator />
                    {!isTrashView ? (
                      <ContextMenuItem onSelect={() => openEntryDetails(item.id)}>
                        <Eye size={13} aria-hidden="true" />
                        查看详情
                      </ContextMenuItem>
                    ) : null}
                    {!isTrashView ? (
                      <ContextMenuItem onSelect={() => onOpenEntryInSidePane(item.id)}>
                        <PanelRight size={13} aria-hidden="true" />
                        在右侧打开
                      </ContextMenuItem>
                    ) : null}
                    {!isTrashView && (item.status === 'Parsed' || item.status === 'Failed') ? (
                      <ContextMenuItem
                        disabled={activeJobs > 0}
                        onSelect={() => {
                          void Promise.resolve(onReparseEntry(item.id))
                            .then(() =>
                              notify({
                                title: '已重新提交解析',
                                description: `${item.title} 已重新加入解析队列，解析结果会覆盖现有内容。`
                              })
                            )
                            .catch(() => undefined);
                        }}
                      >
                        <RotateCcw size={13} aria-hidden="true" />
                        重新解析
                      </ContextMenuItem>
                    ) : null}
                    {isTrashView ? (
                      <ContextMenuItem onSelect={() => void onRestoreEntry(item.id)}>
                        <RotateCcw size={13} aria-hidden="true" />
                        恢复条目
                      </ContextMenuItem>
                    ) : null}
                    <ContextMenuItem
                      variant="destructive"
                      onSelect={() => {
                        setDialog({ action: isTrashView ? 'purge' : 'move-to-trash', entry: item });
                      }}
                    >
                      <Trash2 size={13} aria-hidden="true" />
                      {isTrashView ? '彻底删除' : '移到回收站'}
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ))}
            </TableBody>
          </Table>
          </div>
          )}
        </Card>
      </div>
      <EntryActionDialog
        action={dialog?.action ?? 'move-to-trash'}
        busy={actionBusy}
        entry={dialog?.entry ?? null}
        workspaceRoot={workspaceRoot}
        onConfirm={() => void confirmEntryAction()}
        onOpenChange={(open) => {
          if (!open && !actionBusy) {
            setDialog(null);
          }
        }}
      />
      <Dialog open={emptyTrashConfirmOpen} onOpenChange={(open) => {
        if (!open && !emptyTrashBusy) {
          setEmptyTrashConfirmOpen(false);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle size={16} aria-hidden="true" />
              清空回收站
            </DialogTitle>
            <DialogDescription>
              将永久删除总回收站中的 {trashItems.length} 个可见项目，此操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            条目的 PDF、笔记、解析结果和元数据都会被移除。
          </div>
          <DialogFooter>
            <Button
              disabled={emptyTrashBusy}
              type="button"
              variant="outline"
              onClick={() => setEmptyTrashConfirmOpen(false)}
            >
              取消
            </Button>
            <Button
              disabled={emptyTrashBusy || trashItems.length === 0}
              type="button"
              variant="destructive"
              onClick={() => void confirmEmptyTrash()}
            >
              <Trash2 size={14} aria-hidden="true" />
              清空回收站
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {entryDragPreview && typeof document !== 'undefined'
        ? createPortal(
            <div
              aria-hidden="true"
              className="pointer-events-none fixed z-[2147483000] flex h-8 max-w-72 -translate-x-1/2 -translate-y-1/2 items-center rounded-none border bg-popover px-2.5 text-xs font-medium text-popover-foreground shadow-lg"
              data-entry-tag-drag-preview="true"
              style={{ left: entryDragPreview.x, top: entryDragPreview.y }}
            >
              <span className="truncate">{entryDragPreview.title}</span>
            </div>,
            document.body
          )
        : null}
    </>
  );

  if (standalone) {
    return <div className="h-full min-h-0 overflow-auto">{content}</div>;
  }

  return (
    <TabsContent className="m-0 h-full min-h-0" value="library">
      {content}
    </TabsContent>
  );
}

function ReadingOverview({ overview }: { overview: ReturnType<typeof buildReadingOverview> }) {
  const maxDailyMs = Math.max(...overview.days.map((day) => day.activeMs), 1);
  return (
    <section aria-label="阅读概览" className="border-t bg-muted/10 px-3 py-2.5">
      <div className="grid gap-3 sm:grid-cols-[repeat(3,minmax(110px,1fr))_minmax(240px,2fr)]">
        <OverviewMetric label="今日阅读" value={formatReadingDuration(overview.todayMs)} />
        <OverviewMetric label="累计阅读" value={formatReadingDuration(overview.totalMs)} />
        <OverviewMetric label="阅读中 / 已读完" value={`${overview.inProgress} / ${overview.completed}`} />
        <div className="min-w-0 rounded-md border bg-background px-3 py-2">
          <div className="mb-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>最近 7 天</span>
            <span>{formatReadingDuration(overview.weekMs)}</span>
          </div>
          <div className="flex h-8 items-end gap-1" aria-label="最近 7 天阅读时长柱状图">
            {overview.days.map((day) => (
              <div className="flex h-full min-w-0 flex-1 items-end" key={day.date} title={`${day.label}：${formatReadingDuration(day.activeMs)}`}>
                <div
                  className="w-full rounded-sm bg-primary/70"
                  style={{ height: `${Math.max(day.activeMs > 0 ? 10 : 3, (day.activeMs / maxDailyMs) * 100)}%` }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function OverviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function ReadingProgressCell({ state }: { state?: EntryReadingState }) {
  const progress = getReadingProgress(state);
  if (!state || (state.total_active_ms <= 0 && state.current_page_idx === null)) {
    return <div className="text-center text-xs text-muted-foreground">未开始</div>;
  }
  const pageLabel = state.current_page_idx === null || state.page_count <= 0
    ? ''
    : `第 ${state.current_page_idx + 1}/${state.page_count} 页`;
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center justify-between gap-2 text-[10px] tabular-nums">
        <span className="font-medium">{progress >= 100 ? '已读完' : `${progress}%`}</span>
        <span className="truncate text-muted-foreground">{pageLabel}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

function EntryFolderHoverDetails({
  entry,
  readingState
}: {
  entry: LibraryEntry;
  readingState?: EntryReadingState;
}) {
  const noteCount = entry.contents.filter((content) => content.kind === 'note').length;
  const description = entry.fields.description?.trim();
  return (
    <div className="space-y-2.5">
      <div>
        <div className="break-words text-sm font-semibold leading-snug">{entry.title}</div>
        {description ? <div className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{description}</div> : null}
      </div>
      <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-x-2 gap-y-1.5 border-t pt-2 text-xs">
        <span className="text-muted-foreground">PDF</span>
        <span className="break-all">{entry.pdfFileName || '无 PDF 文件'}</span>
        <span className="text-muted-foreground">解析状态</span>
        <span><StatusBadge status={entry.status} /></span>
        <span className="text-muted-foreground">阅读进度</span>
        <span>{formatReadingSummary(readingState)}</span>
        <span className="text-muted-foreground">最近阅读</span>
        <span>{formatLastRead(readingState?.last_read_at)}</span>
        <span className="text-muted-foreground">笔记</span>
        <span>{noteCount} 篇</span>
        <span className="text-muted-foreground">修改日期</span>
        <span>{formatDate(entry.updatedAt)}</span>
      </div>
      <div className="border-t pt-2">
        <div className="mb-1 text-[11px] text-muted-foreground">标签</div>
        {entry.tags.length > 0 ? <TagBadges tags={entry.tags} /> : <span className="text-xs text-muted-foreground">无标签</span>}
      </div>
    </div>
  );
}

function TagFolderTile({
  node,
  updatedAt,
  onAssignEntryToTag,
  onOpen
}: {
  node: TagNode;
  updatedAt: string | null;
  onAssignEntryToTag: (entryId: string, tagPath: string) => Promise<unknown> | unknown;
  onOpen: () => void;
}) {
  const [dragState, setDragState] = useState(getEntryTagDragState);
  const targetRef = useRef<HTMLButtonElement>(null);
  const dragOver = targetRef.current ? isEntryTagDropTargetActive(targetRef.current, dragState) : false;

  useEffect(() => subscribeEntryTagDrag(() => setDragState(getEntryTagDragState())), []);

  useEffect(() => {
    const element = targetRef.current;
    if (!element) {
      return;
    }
    return registerEntryTagDropTarget({
      element,
      onDrop: (entryId) => onAssignEntryToTag(entryId, node.path)
    });
  }, [node.path, onAssignEntryToTag]);

  const contentSummary = `${node.children.length > 0 ? `${node.children.length} 个子文件夹 · ` : ''}${node.count} 个条目`;
  return (
    <HoverCard closeDelay={100} openDelay={350}>
      <HoverCardTrigger asChild>
        <button
          ref={targetRef}
          className={cn(
            'grid h-9 w-full min-w-0 grid-cols-[minmax(280px,2fr)_110px_minmax(190px,1.2fr)_150px_110px_34px] items-center border-b text-left transition-colors',
            dragOver ? 'bg-primary/10 outline outline-1 -outline-offset-1 outline-primary/40' : 'hover:bg-accent/55'
          )}
          title={dragOver ? `释放以将条目添加到 ${node.path}` : undefined}
          type="button"
          onClick={onOpen}
        >
          <span className="flex min-w-0 items-center gap-2 px-2">
            <Folder className="shrink-0 fill-amber-400/55 text-amber-600" size={15} aria-hidden="true" />
            <span className="truncate font-medium">{node.name}</span>
          </span>
          <span className="px-2 text-muted-foreground">标签文件夹</span>
          <span className="truncate px-2 text-muted-foreground">{contentSummary}</span>
          <span className="px-2 text-muted-foreground">—</span>
          <span className="px-2 tabular-nums text-muted-foreground">{updatedAt ? formatDate(updatedAt) : '—'}</span>
          <span aria-hidden="true" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-80" side="right">
        <div className="space-y-2">
          <div>
            <div className="break-words font-semibold">{node.name}</div>
            <div className="mt-0.5 break-all text-[11px] text-muted-foreground">{node.path}</div>
          </div>
          <div className="grid grid-cols-[72px_1fr] gap-x-2 gap-y-1 border-t pt-2 text-xs">
            <span className="text-muted-foreground">类型</span><span>标签文件夹</span>
            <span className="text-muted-foreground">内容</span><span>{contentSummary}</span>
            <span className="text-muted-foreground">操作</span><span>单击打开；可将条目拖入以添加此标签</span>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function readStoredEntryLibraryLayout(): EntryLibraryLayout {
  if (typeof window === 'undefined') {
    return 'table';
  }
  const stored = window.localStorage.getItem(ENTRY_LIBRARY_LAYOUT_STORAGE_KEY);
  return stored === 'tag-folders' ? 'tag-folders' : 'table';
}

function readStoredEntryLibraryColumns() {
  const defaults = new Set(ENTRY_LIBRARY_COLUMNS.map((column) => column.id));
  if (typeof window === 'undefined') {
    return defaults;
  }
  try {
    const stored = JSON.parse(window.localStorage.getItem(ENTRY_LIBRARY_COLUMNS_STORAGE_KEY) ?? 'null');
    if (!Array.isArray(stored)) {
      return defaults;
    }
    const validIds = new Set(ENTRY_LIBRARY_COLUMNS.map((column) => column.id));
    const selected = stored.filter((value): value is EntryLibraryColumnId => validIds.has(value));
    return selected.length > 0 ? new Set(selected) : defaults;
  } catch {
    return defaults;
  }
}

function buildTagBreadcrumb(tags: TagMeta[], activeTag: string | null) {
  if (!activeTag) {
    return [];
  }
  const tagById = new Map(tags.map((tag) => [tag.id, tag]));
  const breadcrumb: Array<{ id: string; name: string }> = [];
  const visited = new Set<string>();
  let current = tagById.get(activeTag);

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    breadcrumb.unshift({ id: current.id, name: current.name });
    current = current.parent_id ? tagById.get(current.parent_id) : undefined;
  }
  return breadcrumb;
}

function filterEntries(
  entries: LibraryEntry[],
  libraryView: LibraryView,
  activeTagIds: Set<string> | null,
  query: string,
  sortBy: string,
  recentReadingEntryIds: string[],
  readingStates: Record<string, EntryReadingState>
) {
  const entriesInView = entries.filter((item) => {
    if (libraryView === 'recent') {
      return recentReadingEntryIds.includes(item.id);
    }
    if (libraryView === 'parsed') {
      return item.status === 'Parsed';
    }
    if (libraryView === 'parsing') {
      return ['Queued', 'Uploading', 'Parsing'].includes(item.status);
    }
    if (libraryView === 'failed') {
      return item.status === 'Failed';
    }
    if (libraryView === 'no_pdf') {
      return item.status === 'No PDF';
    }
    return true;
  });
  const entriesInTag = activeTagIds
    ? entriesInView.filter((item) => item.tagIds.some((tagId) => activeTagIds.has(tagId)))
    : entriesInView;
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? entriesInTag.filter((item) => {
        const fieldText = Object.entries(item.fields)
          .flatMap(([key, value]) => [key, value])
          .join(' ');
        const haystack = [item.title, item.status, item.pdfFileName ?? '', fieldText, ...item.tags]
          .join(' ')
          .toLowerCase();
        return haystack.includes(normalizedQuery);
      })
    : entriesInTag;

  return [...filtered].sort((left, right) => {
    if (libraryView === 'recent') {
      return recentReadingEntryIds.indexOf(left.id) - recentReadingEntryIds.indexOf(right.id);
    }
    if (sortBy === 'title') {
      return left.title.localeCompare(right.title);
    }
    if (sortBy === 'parser') {
      return left.status.localeCompare(right.status);
    }
    if (sortBy === 'reading-progress') {
      return getReadingProgress(readingStates[right.id]) - getReadingProgress(readingStates[left.id]);
    }
    if (sortBy === 'last-read') {
      return getReadingTimestamp(readingStates[right.id]) - getReadingTimestamp(readingStates[left.id]);
    }
    if (sortBy === 'reading-time') {
      return (readingStates[right.id]?.total_active_ms ?? 0) - (readingStates[left.id]?.total_active_ms ?? 0);
    }
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

function getReadingProgress(state?: EntryReadingState) {
  if (!state || state.page_count <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((state.visited_pages.length / state.page_count) * 100));
}

function getReadingTimestamp(state?: EntryReadingState) {
  return state?.last_read_at ? new Date(state.last_read_at).getTime() : 0;
}

function formatReadingDuration(milliseconds: number) {
  if (milliseconds < 60_000) {
    return milliseconds > 0 ? '< 1 分钟' : '0 分钟';
  }
  const minutes = Math.round(milliseconds / 60_000);
  if (minutes < 60) {
    return `${minutes} 分钟`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours} 小时 ${remainingMinutes} 分` : `${hours} 小时`;
}

function formatCompactTags(tags: string[]) {
  if (tags.length === 0) {
    return '无标签';
  }
  return tags.length === 1 ? tags[0] : `${tags[0]}  +${tags.length - 1}`;
}

function formatReadingSummary(state?: EntryReadingState) {
  if (!state || (state.total_active_ms <= 0 && state.current_page_idx === null)) {
    return '未开始';
  }
  const progress = getReadingProgress(state);
  const page = state.current_page_idx === null ? null : `第 ${state.current_page_idx + 1}/${state.page_count} 页`;
  return [page ?? `${progress}%`, formatReadingDuration(state.total_active_ms)].join(' · ');
}

function formatLastRead(value?: string | null) {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (date.getTime() >= dayStart) {
    return `今天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

function buildReadingOverview(
  entries: LibraryEntry[],
  readingStates: Record<string, EntryReadingState>
) {
  const states = entries.map((entry) => readingStates[entry.id]).filter(Boolean);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const dateKey = formatLocalDate(date);
    const activeMs = states.reduce((sum, state) => sum + (state.daily_active_ms[dateKey] ?? 0), 0);
    return {
      activeMs,
      date: dateKey,
      label: date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
    };
  });
  const todayMs = days[days.length - 1]?.activeMs ?? 0;
  const totalMs = states.reduce((sum, state) => sum + state.total_active_ms, 0);
  return {
    completed: states.filter((state) => getReadingProgress(state) >= 100).length,
    days,
    inProgress: states.filter((state) => {
      const progress = getReadingProgress(state);
      return state.total_active_ms > 0 && progress < 100;
    }).length,
    todayMs,
    totalMs,
    weekMs: days.reduce((sum, day) => sum + day.activeMs, 0)
  };
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
