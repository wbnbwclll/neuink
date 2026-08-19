import type { AssistantMessagePart } from '@/shared/ipc/assistantApi';
import type {
  ResearchOutline,
  ResearchProgressEvent
} from '@/shared/types/research';

import { ResearchOutlineCard } from './ResearchOutlineCard';

export function researchOutlineFromParts(
  parts: AssistantMessagePart[]
): ResearchOutline | null {
  return (
    parts.find(
      (part): part is Extract<AssistantMessagePart, { type: 'research-outline' }> =>
        part.type === 'research-outline'
    )?.outline ?? null
  );
}

export function researchProgressFromParts(
  parts: AssistantMessagePart[]
): ResearchProgressEvent[] {
  return parts
    .filter(
      (part): part is Extract<AssistantMessagePart, { type: 'research-progress' }> =>
        part.type === 'research-progress'
    )
    .map((part) => part.progress);
}

export function ResearchParts({
  disabled = false,
  outline,
  onStartResearch,
  progress
}: {
  disabled?: boolean;
  outline: ResearchOutline | null;
  onStartResearch?: (outline: ResearchOutline) => void;
  progress: ResearchProgressEvent[];
}) {
  return (
    <>
      {progress.length > 0 ? <ResearchProgressList events={progress} /> : null}
      {outline ? (
        <ResearchOutlineCard
          disabled={disabled}
          outline={outline}
          onStartResearch={(nextOutline) => onStartResearch?.(nextOutline)}
        />
      ) : null}
    </>
  );
}

function ResearchProgressList({ events }: { events: ResearchProgressEvent[] }) {
  return (
    <div className="mt-2 grid gap-1">
      {events.map((event, index) => (
        <div
          className="min-w-0 rounded-sm border bg-muted/25 px-2 py-1 text-[11px] leading-4 text-muted-foreground"
          key={`${event.stage}:${index}`}
        >
          <span className="mr-1.5 shrink-0 rounded-sm border bg-background px-1 py-0.5 text-[10px] font-medium">
            {researchStageLabel(event.stage)}
          </span>
          {event.summary}
          {event.completedBlocks != null && event.totalBlocks != null ? (
            <span className="ml-1.5 text-primary">
              {event.completedBlocks}/{event.totalBlocks}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function researchStageLabel(stage: ResearchProgressEvent['stage']) {
  if (stage === 'plan') {
    return '规划';
  }
  if (stage === 'research') {
    return '研究';
  }
  if (stage === 'report') {
    return '报告';
  }
  return '完成';
}
