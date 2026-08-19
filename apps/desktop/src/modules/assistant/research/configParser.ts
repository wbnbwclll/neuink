import type { ResearchDepth, ResearchMode } from '@/shared/types/agentRuntime';
import type { ResearchExecutionPolicy } from './types';

// 深度 → 默认子主题数（对应 DeepTutor request_config.AUTO_SUBTOPICS）。
export const AUTO_SUBTOPICS: Record<ResearchDepth, number> = {
  quick: 2,
  standard: 4,
  deep: 6,
  manual: 4
};

// 预置深度策略，直译 DeepTutor request_config.py `_build_depth_policy`：
//   quick{maxIterations1, series, maxParallel1, queue2}
//   standard{3, series, 1, 5}
//   deep{5, parallel, 3, 8}
const DEPTH_STRATEGIES: Record<
  Exclude<ResearchDepth, 'manual'>,
  {
    maxIterations: number;
    maxParallel: number;
    queueLimit: number;
    executionMode: 'series' | 'parallel';
  }
> = {
  quick: { executionMode: 'series', maxIterations: 1, maxParallel: 1, queueLimit: 2 },
  standard: { executionMode: 'series', maxIterations: 3, maxParallel: 1, queueLimit: 5 },
  deep: { executionMode: 'parallel', maxIterations: 5, maxParallel: 3, queueLimit: 8 }
};

// 手动模式：串行、逐块迭代数取用户设置（blockMaxIterations 兜底 3），
// 队列上限放宽到 8 以便容纳用户手动添加的子主题。
const MANUAL_STRATEGY = {
  executionMode: 'series' as const,
  maxIterations: 3,
  maxParallel: 1,
  queueLimit: 8
};

export type ResearchConfigInput = {
  depth: ResearchDepth;
  mode: ResearchMode;
  blockMaxIterations?: number | null;
  manualMaxIterations?: number | null;
};

export function buildResearchExecutionPolicy(input: ResearchConfigInput): ResearchExecutionPolicy {
  const base = input.depth === 'manual' ? MANUAL_STRATEGY : DEPTH_STRATEGIES[input.depth];
  const maxIterations =
    input.depth === 'manual' && input.manualMaxIterations != null
      ? input.manualMaxIterations
      : base.maxIterations;
  const effectiveMaxIterations =
    input.blockMaxIterations != null && input.blockMaxIterations > 0
      ? Math.max(input.blockMaxIterations, maxIterations)
      : maxIterations;
  return {
    depth: input.depth,
    mode: input.mode,
    maxIterations: effectiveMaxIterations,
    maxParallel: base.maxParallel,
    queueLimit: base.queueLimit,
    executionMode: base.executionMode
  };
}

export function parseResearchConfig(input: ResearchConfigInput): ResearchExecutionPolicy {
  return buildResearchExecutionPolicy(input);
}
