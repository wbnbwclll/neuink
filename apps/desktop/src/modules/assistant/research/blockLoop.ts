import { generateText, jsonSchema, stepCountIs, streamText, tool } from 'ai';

import type {
  AssistantToolTraceEvent,
  LlmProfile,
  ScopeSnapshot
} from '@/shared/ipc/assistantApi';
import type { AgentExecutionSelection, AgentRuntimeSettings, AgentToolId } from '@/shared/types/agentRuntime';
import type { ResearchMode } from '@/shared/types/agentRuntime';
import type { ResearchProgressEvent } from '@/shared/types/research';

import {
  AgentLoopGuard,
  AgentLoopGuardError,
  createAgentLoopState
} from '../shared/agent-core';
import { errorMessage } from '../shared/harness/runState';
import { createNeuinkModel, generationSettings } from '../shared/sdk/provider';
import { createAssistantTools } from '../shared/sdk/tools';
import { CitationManager } from './citationManager';
import { summarizeToolResult as noteSummarizeToolResult } from './noteAgent';
import { extractLabeledBody, stripLeadingLabel } from './orchestrator';
import { emitResearchProgress } from './progressEvents';
import { DynamicTopicQueue } from './topicQueue';
import type { ResearchedBlock, ToolTrace, TopicBlock } from './types';
import { loadResearchPrompt, renderResearchPrompt } from './prompts';

// 研究块允许的证据工具（对应 DeepTutor RESEARCH_BLOCK_TOOL_ALLOWLIST）：
// 只读检索 + Sciverse，不含笔记/技能/委派等非证据工具。MCP 工具按
// researchAssistant.allowedMcpServerIds 额外并入。
const RESEARCH_BLOCK_TOOL_IDS: AgentToolId[] = [
  'search_segments',
  'read_segment_content',
  'read_entry_assistant_context',
  'search_sciverse_evidence',
  'read_sciverse_content',
  'search_sciverse_metadata',
  'get_sciverse_metadata_catalog',
  'search_sciverse_paper_schema',
  'get_sciverse_paper_schema'
];

// 单块研究后，若迭代预算耗尽仍未产出 FINISH，用观察摘要强制收敛。
const FORCE_FINISH_MAX_TOKENS = 2000;
const FORCE_FINISH_OBSERVATION_CHARS = 24_000;

export type ResearchBlockOptions = {
  abortSignal?: AbortSignal;
  block: TopicBlock;
  citations: CitationManager;
  maxIterations: number;
  mode: ResearchMode;
  noteMaxTokens?: number | null;
  onProgress?: (event: ResearchProgressEvent) => void;
  onToolEvent?: (event: AssistantToolTraceEvent) => void;
  queue: DynamicTopicQueue;
  root: string;
  runtimeSettings: AgentRuntimeSettings;
  scope: ScopeSnapshot;
  settings: LlmProfile;
  topic: string;
};

export async function researchBlock(options: ResearchBlockOptions): Promise<ResearchedBlock> {
  const {
    abortSignal,
    block,
    citations,
    maxIterations,
    mode,
    noteMaxTokens,
    onProgress,
    onToolEvent,
    queue,
    root,
    runtimeSettings,
    scope,
    settings,
    topic
  } = options;
  queue.markResearching(block.blockId);
  emitResearchProgress(onProgress, 'research', `正在研究：${block.subTopic}`);

  const agentLoopState = createAgentLoopState(block.subTopic);
  agentLoopState.maxTurns = Math.max(2, maxIterations);
  agentLoopState.maxToolCalls = Math.max(8, maxIterations * 4);
  const loopGuard = new AgentLoopGuard(agentLoopState);

  const runtime = await createAssistantTools({
    activeExecution: researchBlockExecution(runtimeSettings),
    loopGuard,
    onToolEvent,
    root,
    runtimeSettings,
    scope,
    summarizeToolResult: async ({ toolName, input, output, sources }) => {
      const query = toolQuery(toolName, input);
      const summary = await noteSummarizeToolResult({
        abortSignal,
        maxTokens: noteMaxTokens,
        query,
        rawOutput: output,
        settings,
        toolName
      });
      const citationId = citations.generateResearchCitationId(block.blockId);
      const trace: ToolTrace = {
        toolId: `${block.blockId}-tool-${citationId}`,
        citationId,
        toolName,
        query,
        summary,
        sources
      };
      block.toolTraces.push(trace);
      citations.addCitation({
        citationId,
        toolName,
        query,
        summary,
        sources
      });
      return `[${citationId}] ${summary}`;
    }
  });

  runtime.tools.append_topic = tool({
    description:
      '把研究中新发现的子主题加入研究队列。仅当你在研究当前子主题时发现另一个值得独立聚焦研究的子主题时调用；返回信息会说明是否已入队。',
    inputSchema: jsonSchema({
      additionalProperties: false,
      properties: {
        overview: {
          description: '一两句话说明该子主题应覆盖什么（可选）。',
          type: 'string'
        },
        title: {
          description: '新子主题的简短标题。',
          type: 'string'
        }
      },
      required: ['title'],
      type: 'object'
    }),
    execute: async (input) =>
      (await handleAppendTopic({
        input,
        onProgress,
        parentBlock: block,
        queue
      })).message
  });

  const system = renderResearchPrompt(await loadResearchPrompt('research.block.system'), {
    block_overview: block.overview || '（无概述）',
    block_title: block.subTopic,
    max_iterations: String(Math.max(1, maxIterations)),
    mode,
    sibling_topics: renderSiblingTopics(queue, block),
    topic
  });
  const user = renderResearchPrompt(await loadResearchPrompt('research.block.user'), {
    accumulated_knowledge: '（尚未收集到证据）',
    block_title: block.subTopic,
    sibling_topics: renderSiblingTopics(queue, block),
    topic
  });

  let knowledge = '';
  let budgetExhausted = false;
  const result = streamText({
    abortSignal,
    ...generationSettings(settings),
    model: createNeuinkModel(settings),
    prompt: user,
    stopWhen: stepCountIs(Math.max(1, maxIterations)),
    system,
    tools: runtime.tools
  });
  try {
    for await (const part of result.fullStream) {
      if (part.type === 'start-step') {
        loopGuard.startTurn();
        continue;
      }
      if (part.type === 'text-delta') {
        knowledge += part.text;
        continue;
      }
      if (part.type === 'tool-error') {
        onToolEvent?.({
          error: errorMessage(part.error),
          id: part.toolCallId,
          status: 'error',
          toolName: String(part.toolName)
        });
        continue;
      }
      if (part.type === 'error') {
        throw new Error(errorMessage(part.error));
      }
    }
  } catch (error) {
    // 迭代预算被 AgentLoopGuard 截断（模型持续调用工具不收敛），视为预算
    // 耗尽走强制收敛；其余错误（含 abort）继续向上抛。
    if (error instanceof AgentLoopGuardError) {
      budgetExhausted = true;
    } else {
      throw error;
    }
  } finally {
    block.iterationCount = agentLoopState.turnCount;
  }

  let finishedText = extractBlockKnowledge(knowledge);
  if (!finishedText && (budgetExhausted || runtime.observations.length > 0)) {
    // 迭代预算在工具轮耗尽（stepCountIs 截断），用观察摘要强制收敛。
    emitResearchProgress(onProgress, 'research', `${block.subTopic} 达到迭代上限，正在收敛…`);
    finishedText = await forceFinishBlock({
      abortSignal,
      maxTokens: noteMaxTokens ?? FORCE_FINISH_MAX_TOKENS,
      observations: runtime.observations,
      settings,
      system,
      topic: block.subTopic
    });
  }

  if (finishedText.trim() && agentLoopState.status !== 'failed') {
    queue.markCompleted(block.blockId);
  } else {
    queue.markFailed(block.blockId);
  }
  emitResearchProgress(
    onProgress,
    'research',
    `${block.subTopic} ${finishedText.trim() ? '完成' : '未完成'}`,
    {}
  );
  return { block, knowledge: finishedText };
}

// ---------------------------------------------------------------------------
// 纯辅助（可单元测试）
// ---------------------------------------------------------------------------

export function researchBlockExecution(runtimeSettings: AgentRuntimeSettings): AgentExecutionSelection {
  return {
    agent: {
      ...runtimeSettings.researchAssistant,
      enabledToolIds: RESEARCH_BLOCK_TOOL_IDS
    },
    skillPackages: []
  };
}

export function toolQuery(toolName: string, input: Record<string, unknown>): string {
  if (typeof input.query === 'string' && input.query.trim()) {
    return input.query.trim();
  }
  if (toolName === 'read_segment_content') {
    return String(input.segment_uid ?? '');
  }
  if (toolName === 'read_sciverse_content') {
    return String(input.doc_id ?? input.title ?? '');
  }
  if (toolName === 'read_entry_assistant_context') {
    return String(input.entry_id ?? '');
  }
  return toolName;
}

export type AppendTopicResult = {
  accepted: boolean;
  block?: TopicBlock;
  message: string;
};

export function decideAppendTopic({
  overview,
  parentBlock,
  queue,
  title
}: {
  overview?: string;
  parentBlock: TopicBlock;
  queue: DynamicTopicQueue;
  title: string;
}): AppendTopicResult {
  const cleanTitle = title.trim();
  if (!cleanTitle) {
    return { accepted: false, message: 'APPEND rejected: 缺少标题。' };
  }
  if (queue.isFull()) {
    return {
      accepted: false,
      message:
        'APPEND rejected: 主题队列已满，无法再入队。请继续研究当前子主题，并输出 FINISH。'
    };
  }
  const duplicate = queue.findSimilar(cleanTitle);
  if (duplicate) {
    return {
      accepted: false,
      message: `APPEND rejected: 「${cleanTitle}」与已有块 ${duplicate.blockId}（${duplicate.subTopic}）过于相似。`
    };
  }
  const block = queue.appendChild(parentBlock, cleanTitle, overview?.trim() ?? '');
  if (!block) {
    return { accepted: false, message: 'APPEND rejected: 主题队列已满。' };
  }
  return {
    accepted: true,
    block,
    message: `已加入队列：${block.blockId}（${cleanTitle}），将在后续轮次单独研究。`
  };
}

export function renderSiblingTopics(queue: DynamicTopicQueue, currentBlock: TopicBlock): string {
  const siblings = queue
    .getBlocks()
    .filter((block) => block.blockId !== currentBlock.blockId)
    .map((block) => `  - [${block.blockId}] ${block.subTopic}`);
  return siblings.length > 0 ? siblings.join('\n') : '（无）';
}

export function extractBlockKnowledge(text: string): string {
  return extractLabeledBody(text, 'FINISH') ?? stripLeadingLabel(text) ?? '';
}

// ---------------------------------------------------------------------------
// 内部实现
// ---------------------------------------------------------------------------

async function handleAppendTopic({
  input,
  onProgress,
  parentBlock,
  queue
}: {
  input: unknown;
  onProgress?: (event: ResearchProgressEvent) => void;
  parentBlock: TopicBlock;
  queue: DynamicTopicQueue;
}): Promise<AppendTopicResult> {
  const object = (input ?? {}) as Record<string, unknown>;
  const result = decideAppendTopic({
    overview: typeof object.overview === 'string' ? object.overview : undefined,
    parentBlock,
    queue,
    title: typeof object.title === 'string' ? object.title : ''
  });
  if (result.accepted && result.block) {
    emitResearchProgress(onProgress, 'research', `新子主题已入队：${result.block.subTopic}`);
  }
  return result;
}

async function forceFinishBlock({
  abortSignal,
  maxTokens,
  observations,
  settings,
  system,
  topic
}: {
  abortSignal?: AbortSignal;
  maxTokens: number;
  observations: Array<{ output: unknown; toolName: string }>;
  settings: LlmProfile;
  system: string;
  topic: string;
}): Promise<string> {
  const observationText = observations
    .map((observation) => JSON.stringify(observation.output))
    .join('\n')
    .slice(0, FORCE_FINISH_OBSERVATION_CHARS);
  const prompt = [
    `研究子主题「${topic}」的迭代在上一步工具调用后结束，尚未产出结论。`,
    '请基于下面的实际工具观察，用最多 4 句话为该子主题写出研究小结（保留出现的引文标记）：',
    '',
    observationText
  ].join('\n');
  try {
    const { text } = await generateText({
      abortSignal,
      ...generationSettings(settings),
      maxOutputTokens: Math.max(maxTokens, 500),
      model: createNeuinkModel(settings),
      prompt,
      system
    });
    return (text ?? '').trim();
  } catch {
    return '';
  }
}
