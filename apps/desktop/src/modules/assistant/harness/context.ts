import type { AssistantContextSnapshotPinnedSegment } from '@/shared/ipc/assistantApi';
import type {
  AssistantActiveSegment,
  AssistantActiveSurfaceSnapshot,
  AssistantContext,
  AssistantContextPlan
} from '@/shared/types/assistant';

export type AssistantObservedContext = {
  activeEntryId: string | null;
  activeNote: { entryId: string; noteId: string } | null;
  activeSegment: AssistantActiveSegment | null;
  activeSurface: AssistantActiveSurfaceSnapshot | null;
  pinnedSegments: AssistantContextSnapshotPinnedSegment[];
  summary: string;
};

export function observeAssistantContext({
  assistantContext,
  contextPlan = null,
  activeSegment = null,
  activeSurface = null,
  fallbackEntryId = null,
  fallbackNote = null
}: {
  assistantContext?: AssistantContext | null;
  contextPlan?: AssistantContextPlan | null;
  activeSegment?: AssistantActiveSegment | null;
  activeSurface?: AssistantActiveSurfaceSnapshot | null;
  fallbackEntryId?: string | null;
  fallbackNote?: { entryId: string; noteId: string } | null;
}): AssistantObservedContext {
  const contextEntries = (assistantContext?.items ?? []).filter((item) => item.kind === 'entry');
  const selectedEntryIds = Array.from(
    new Set((assistantContext?.items ?? []).map((item) => item.entryId))
  );
  const selectedNotes = contextEntries.filter(
    (item) => item.contentKind === 'note' && Boolean(item.contentId)
  );
  const plannedNoteTarget = contextPlan?.editTarget?.targetKind === 'markdown_note'
    ? contextEntries.find(
        (item) => item.id === contextPlan.editTarget?.attachmentId && item.contentKind === 'note'
      )
    : null;
  const focusedEntryId = activeSurface?.entryId ?? fallbackEntryId;
  const activeEntryId = selectedEntryIds.length === 1 ? selectedEntryIds[0] : focusedEntryId;
  const explicitPinnedSegments = uniquePinnedSegments(
    (assistantContext?.items ?? [])
      .filter((item) => item.kind === 'segment')
      .map((item) => ({
        entryId: item.entryId,
        segmentUid: item.segmentUid
      }))
  );
  const focusedSegment = activeSegment && activeSegment.entryId === focusedEntryId
    ? activeSegment
    : null;
  const pinnedSegments = explicitPinnedSegments.length > 0 || !focusedSegment
    ? explicitPinnedSegments
    : [{ entryId: focusedSegment.entryId, segmentUid: focusedSegment.segmentUid }];
  const singleSelectedNote = selectedNotes.length === 1 ? selectedNotes[0] : null;
  const resolvedNote = plannedNoteTarget ?? singleSelectedNote;
  const activeNote = resolvedNote?.contentId
    ? { entryId: resolvedNote.entryId, noteId: resolvedNote.contentId }
    : selectedNotes.length > 1
      ? null
      : fallbackNote;

  return {
    activeEntryId,
    activeNote,
    activeSegment: focusedSegment,
    activeSurface,
    pinnedSegments,
    summary: [
      contextEntries.length > 0
        ? `${contextEntries.length} selected context entr${contextEntries.length === 1 ? 'y' : 'ies'}`
        : 'no selected context entries',
      activeEntryId ? `resolved entry ${activeEntryId}` : 'no resolved entry',
      activeNote ? `resolved note ${activeNote.noteId}` : 'no resolved note',
      activeSurface
        ? `focused ${activeSurface.pane} tab ${activeSurface.surfaceKey}`
        : 'no focused tab snapshot',
      `${pinnedSegments.length} pinned segment${pinnedSegments.length === 1 ? '' : 's'}`
    ].join(', ')
  };
}

function uniquePinnedSegments(
  segments: AssistantContextSnapshotPinnedSegment[]
): AssistantContextSnapshotPinnedSegment[] {
  const seen = new Set<string>();
  const unique: AssistantContextSnapshotPinnedSegment[] = [];
  for (const segment of segments) {
    const key = `${segment.entryId}:${segment.segmentUid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(segment);
  }
  return unique;
}
