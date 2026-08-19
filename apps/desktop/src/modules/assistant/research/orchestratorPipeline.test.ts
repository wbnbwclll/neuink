import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ConversationSourceLink,
  LlmProfile,
  ScopeSnapshot
} from '@/shared/ipc/assistantApi';
import type { AgentRuntimeSettings } from '@/shared/types/agentRuntime';
import type { ResearchOutline } from '@/shared/types/research';

import { researchBlock } from './blockLoop';
import { runResearchPipeline } from './orchestrator';
import type { ResearchPipelineInput } from './orchestrator';
import { writeReport } from './reportWriter';
import type { ResearchedBlock } from './types';

// 端到端编排层集成测试：替换 researchBlock / writeReport 两个 LLM/工具边界，
// 用真实 DynamicTopicQueue + buildResearchExecutionPolicy + 进度事件，
// 验证队列驱动、波次调度、APPEND 增块、报告产出的控制流。

vi.mock('./blockLoop', () => ({ researchBlock: vi.fn() }));
vi.mock('./reportWriter', () => ({ writeReport: vi.fn() }));

const mockedResearchBlock = vi.mocked(researchBlock);
const mockedWriteReport = vi.mocked(writeReport);

const standardOutline: ResearchOutline = {
  depth: 'standard',
  items: [
    { overview: 'oa', title: 'A' },
    { overview: 'ob', title: 'B' }
  ],
  mode: 'report',
  topic: '主题'
};

const EMPTY_SCOPE: ScopeSnapshot = {
  tag_ids: [],
  tag_names: [],
  entry_ids: [],
  entry_titles: []
};

const SOURCE: ConversationSourceLink = {
  entry_id: 'e1',
  entry_title: 'Entry',
  page_idx: 0,
  quote: 'quote',
  segment_uid: 's1'
};

function input(confirmedOutline: ResearchOutline): ResearchPipelineInput {
  return {
    blockMaxIterations: 3,
    confirmedOutline,
    depth: confirmedOutline.depth,
    maxQuestionsPerRound: 3,
    maxRounds: 3,
    mode: 'report',
    noteMaxTokens: 500,
    numSubtopics: 2,
    onProgress: vi.fn(),
    question: confirmedOutline.topic,
    root: '/workspace',
    runtimeSettings: {} as AgentRuntimeSettings,
    scope: EMPTY_SCOPE,
    settings: {} as LlmProfile
  };
}

function completeBlock(researched: ResearchedBlock): ResearchedBlock {
  return researched;
}

beforeEach(() => {
  mockedResearchBlock.mockReset();
  mockedWriteReport.mockReset();
  mockedWriteReport.mockImplementation(async () => ({
    markdown: '# 主题\n\n## 1. A\n\n正文 [S1]\n\n## 参考资料\n\n[S1] Entry, p.1',
    sourceLinks: [SOURCE]
  }));
});

describe('runResearchPipeline round 2 (real orchestration, faked LLM/tools)', () => {
  it('drives every seed block and returns the report + sources', async () => {
    mockedResearchBlock.mockImplementation(async (options) => {
      options.queue.markCompleted(options.block.blockId);
      return completeBlock({
        block: options.block,
        knowledge: `knowledge-${options.block.subTopic}`
      });
    });

    const result = await runResearchPipeline(input(standardOutline));

    expect(mockedResearchBlock).toHaveBeenCalledTimes(2);
    const callTopics = mockedResearchBlock.mock.calls.map((call) => call[0].block.subTopic);
    expect(callTopics).toEqual(['A', 'B']);
    expect(mockedWriteReport).toHaveBeenCalledTimes(1);
    expect(mockedWriteReport.mock.calls[0][0].researchedBlocks.map((block) => block.block.subTopic))
      .toEqual(['A', 'B']);
    expect(result.answer).toContain('# 主题');
    expect(result.sources).toEqual([SOURCE]);
  });

  it('emits research/done progress with completed/total counts', async () => {
    mockedResearchBlock.mockImplementation(async (options) => {
      options.queue.markCompleted(options.block.blockId);
      return { block: options.block, knowledge: '' };
    });

    const result = await runResearchPipeline(input(standardOutline));

    const stages = result.progressEvents.map((event) => event.stage);
    // 开始研究 + 每波完成 + 最终 done（standard 串行 2 块 → 3 个 research 事件）
    expect(stages).toEqual(['research', 'research', 'research', 'done']);
    const done = result.progressEvents[result.progressEvents.length - 1];
    expect(done.completedBlocks).toBe(2);
    expect(done.totalBlocks).toBe(2);
  });

  it('serializes waves when executionMode is series (standard: maxParallel 1)', async () => {
    let inFlight = 0;
    let peak = 0;
    mockedResearchBlock.mockImplementation(async (options) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      options.queue.markCompleted(options.block.blockId);
      await Promise.resolve();
      inFlight -= 1;
      return { block: options.block, knowledge: '' };
    });

    await runResearchPipeline(input(standardOutline));

    expect(peak).toBe(1);
    expect(mockedResearchBlock).toHaveBeenCalledTimes(2);
  });

  it('processes newly appended subtopics in later waves', async () => {
    mockedResearchBlock.mockImplementation(async (options) => {
      if (options.block.subTopic === 'A') {
        options.queue.appendChild(options.block, 'C', 'oc');
      }
      options.queue.markCompleted(options.block.blockId);
      return { block: options.block, knowledge: `k-${options.block.subTopic}` };
    });

    const result = await runResearchPipeline(input(standardOutline));

    const callTopics = mockedResearchBlock.mock.calls.map((call) => call[0].block.subTopic);
    expect(callTopics).toEqual(['A', 'B', 'C']);
    expect(result.progressEvents[result.progressEvents.length - 1].totalBlocks).toBe(3);
  });

  it('includes failed blocks in the report with their (possibly empty) knowledge', async () => {
    mockedResearchBlock.mockImplementation(async (options) => {
      if (options.block.subTopic === 'B') {
        options.queue.markFailed(options.block.blockId);
      } else {
        options.queue.markCompleted(options.block.blockId);
      }
      return {
        block: options.block,
        knowledge: options.block.subTopic === 'B' ? '' : 'k'
      };
    });

    await runResearchPipeline(input(standardOutline));

    expect(mockedWriteReport.mock.calls[0][0].researchedBlocks.map((block) => block.block.subTopic))
      .toEqual(['A', 'B']);
    expect(mockedResearchBlock).toHaveBeenCalledTimes(2);
  });
});
