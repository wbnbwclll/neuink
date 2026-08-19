import type { ResearchDepth, ResearchMode } from './agentRuntime';

export type ResearchOutlineItem = {
  title: string;
  overview?: string;
};

export type ResearchOutline = {
  topic: string;
  items: ResearchOutlineItem[];
  mode: ResearchMode;
  depth: ResearchDepth;
};

export type ResearchProgressStage = 'plan' | 'research' | 'report' | 'done';

export type ResearchProgressEvent = {
  stage: ResearchProgressStage;
  summary: string;
  completedBlocks?: number;
  totalBlocks?: number;
};
