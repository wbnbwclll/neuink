import type { ConversationSourceLink } from '@/shared/ipc/assistantApi';
import type { ResearchDepth, ResearchMode } from '@/shared/types/agentRuntime';

// 深度研究管线的领域类型。与 DeepTutor data_structures.py / pipeline.py
// 中的 dataclass 一一对应（TopicBlock / ToolTrace / ResearchedBlock /
// ReportSectionPlan），按 Neuink 前端 TS 风格重写。

export type TopicBlockStatus = 'pending' | 'researching' | 'completed' | 'failed';

export type ToolTrace = {
  toolId: string;
  citationId: string;
  toolName: string;
  query: string;
  summary: string;
  sources: ConversationSourceLink[];
};

export type TopicBlock = {
  blockId: string;
  subTopic: string;
  overview: string;
  status: TopicBlockStatus;
  iterationCount: number;
  toolTraces: ToolTrace[];
  parentBlockId?: string | null;
};

export type ResearchedBlock = {
  block: TopicBlock;
  knowledge: string;
};

export type CitationRecord = {
  citationId: string;
  toolName: string;
  query: string;
  summary: string;
  sources: ConversationSourceLink[];
};

export type ReportSectionPlan = {
  id: string;
  title: string;
  intent: string;
  blockIds: string[];
};

export type ReportOutline = {
  title: string;
  sections: ReportSectionPlan[];
};

export type ResearchExecutionPolicy = {
  depth: ResearchDepth;
  mode: ResearchMode;
  maxIterations: number;
  maxParallel: number;
  queueLimit: number;
  executionMode: 'series' | 'parallel';
};

export type ResearchQueueStats = {
  totalBlocks: number;
  pending: number;
  researching: number;
  completed: number;
  failed: number;
  totalToolCalls: number;
};
