import type { AssistantToolTraceEvent } from '@/shared/ipc/assistantApi';
import type { ResearchProgressEvent, ResearchProgressStage } from '@/shared/types/research';

// 研究进度事件构造器。研究块循环 / 报告器通过 onProgress 上报
// ResearchProgressEvent，harness 再映射为 AssistantToolTraceEvent
// （toolName: `research.{stage}`）驱动 UI 进度行。

export function makeResearchProgress(
  stage: ResearchProgressStage,
  summary: string,
  meta: Pick<ResearchProgressEvent, 'completedBlocks' | 'totalBlocks'> = {}
): ResearchProgressEvent {
  return {
    stage,
    summary,
    ...(meta.completedBlocks !== undefined ? { completedBlocks: meta.completedBlocks } : {}),
    ...(meta.totalBlocks !== undefined ? { totalBlocks: meta.totalBlocks } : {})
  };
}

export function researchProgressTraceEvent(
  runId: string,
  event: ResearchProgressEvent
): AssistantToolTraceEvent {
  return {
    id: `${runId}-${event.stage}`,
    status: 'done',
    summary: event.summary,
    toolName: `research.${event.stage}`
  };
}

export function emitResearchProgress(
  onProgress: ((event: ResearchProgressEvent) => void) | undefined,
  stage: ResearchProgressStage,
  summary: string,
  meta: Pick<ResearchProgressEvent, 'completedBlocks' | 'totalBlocks'> = {}
): void {
  onProgress?.(makeResearchProgress(stage, summary, meta));
}
