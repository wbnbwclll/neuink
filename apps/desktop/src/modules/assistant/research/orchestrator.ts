import { generateText, streamText } from 'ai';

import type {
  AssistantToolTraceEvent,
  ConversationSourceLink,
  LlmProfile,
  ScopeSnapshot
} from '@/shared/ipc/assistantApi';
import type {
  AgentRuntimeSettings,
  ResearchDepth,
  ResearchMode
} from '@/shared/types/agentRuntime';
import type {
  ResearchOutline,
  ResearchOutlineItem,
  ResearchProgressEvent
} from '@/shared/types/research';

import { createNeuinkModel, generationSettings } from '../shared/sdk/provider';
import { researchBlock } from './blockLoop';
import { buildResearchExecutionPolicy } from './configParser';
import { CitationManager } from './citationManager';
import { loadResearchPrompt, renderResearchPrompt } from './prompts';
import { writeReport } from './reportWriter';
import { DynamicTopicQueue } from './topicQueue';
import type { ResearchedBlock } from './types';

// 深度 → 默认子主题数（对应 DeepTutor request_config.AUTO_SUBTOPICS）。
export const AUTO_SUBTOPICS: Record<ResearchDepth, number> = {
  quick: 2,
  standard: 4,
  deep: 6,
  manual: 4
};

export type ResearchPipelineInput = {
  abortSignal?: AbortSignal;
  blockMaxIterations: number;
  confirmedOutline?: ResearchOutline | null;
  depth: ResearchDepth;
  maxQuestionsPerRound: number;
  maxRounds: number;
  mode: ResearchMode;
  noteMaxTokens?: number | null;
  numSubtopics: number;
  onDelta?: (delta: string) => void;
  onProgress?: (event: ResearchProgressEvent) => void;
  onToolEvent?: (event: AssistantToolTraceEvent) => void;
  question: string;
  root: string;
  runtimeSettings: AgentRuntimeSettings;
  scope?: ScopeSnapshot | null;
  settings: LlmProfile;
};

export type ResearchPipelineResult = {
  answer: string;
  outline?: ResearchOutline;
  progressEvents: ResearchProgressEvent[];
  sources?: ConversationSourceLink[];
};

export async function runResearchPipeline(
  input: ResearchPipelineInput
): Promise<ResearchPipelineResult> {
  const progressEvents: ResearchProgressEvent[] = [];
  const emit = (event: ResearchProgressEvent) => {
    progressEvents.push(event);
    input.onProgress?.(event);
  };

  if (!input.confirmedOutline) {
    // 第一轮：改写确认 + 分解为可编辑大纲，暂停等待用户确认。
    emit({ stage: 'plan', summary: '澄清主题' });
    const topic = await rephraseTopic(input);
    emit({ stage: 'plan', summary: '分解子主题' });
    const items = await decomposeTopic(topic, input);
    const outline: ResearchOutline = {
      topic,
      items,
      mode: input.mode,
      depth: input.depth
    };
    const answer = `好的，接下来我会重点研究「${topic}」，并按以下 ${items.length} 个子主题展开。请确认或编辑下方大纲后，点击「开始研究」。`;
    input.onDelta?.(answer);
    return { answer, outline, progressEvents };
  }

  // 第二轮：动态主题队列 + 研究块（按深度策略串行/并行）+ 引文标注报告。
  const outline = input.confirmedOutline;
  const scope = input.scope ?? EMPTY_SCOPE;
  const policy = buildResearchExecutionPolicy({
    depth: outline.depth,
    mode: outline.mode,
    blockMaxIterations: input.blockMaxIterations
  });
  const queue = new DynamicTopicQueue(`research-${Date.now()}`, policy.queueLimit);
  for (const item of outline.items) {
    queue.addBlock(item.title, item.overview ?? '');
  }
  const citations = new CitationManager();
  const researchedBlocks: ResearchedBlock[] = [];
  const initialTotal = queue.getStatistics().totalBlocks;

  emit({
    stage: 'research',
    summary: `开始研究 ${initialTotal} 个子主题（${outline.depth} 深度 · ${policy.executionMode}）`,
    completedBlocks: 0,
    totalBlocks: initialTotal
  });

  // 逐波处理待研究块；研究过程中 append_topic 可动态增块。
  while (queue.getAllPendingBlocks().length > 0) {
    const wave = queue.getAllPendingBlocks().slice(0, policy.maxParallel);
    const results = await Promise.all(
      wave.map((block) =>
        researchBlock({
          abortSignal: input.abortSignal,
          block,
          citations,
          maxIterations: policy.maxIterations,
          mode: outline.mode,
          noteMaxTokens: input.noteMaxTokens,
          onProgress: emit,
          onToolEvent: input.onToolEvent,
          queue,
          root: input.root,
          runtimeSettings: input.runtimeSettings,
          scope,
          settings: input.settings,
          topic: outline.topic
        })
      )
    );
    for (const result of results) {
      researchedBlocks.push(result);
    }
    const stats = queue.getStatistics();
    emit({
      stage: 'research',
      summary: `已完成 ${stats.completed}/${stats.totalBlocks} 个子主题`,
      completedBlocks: stats.completed,
      totalBlocks: stats.totalBlocks
    });
  }

  const report = await writeReport({
    abortSignal: input.abortSignal,
    citations,
    onDelta: input.onDelta,
    onProgress: emit,
    researchedBlocks,
    scope,
    settings: input.settings,
    topic: outline.topic
  });
  const finalStats = queue.getStatistics();
  emit({
    stage: 'done',
    summary: '研究完成',
    completedBlocks: finalStats.completed,
    totalBlocks: finalStats.totalBlocks
  });
  return { answer: report.markdown, progressEvents, sources: report.sourceLinks };
}

const EMPTY_SCOPE: ScopeSnapshot = {
  tag_ids: [],
  tag_names: [],
  entry_ids: [],
  entry_titles: []
};

async function rephraseTopic(input: ResearchPipelineInput): Promise<string> {
  const system = renderResearchPrompt(
    await loadResearchPrompt('research.rephrase.system'),
    {
      max_questions_per_round: input.maxQuestionsPerRound,
      max_rounds: input.maxRounds,
      topic: input.question
    }
  );
  const user = renderResearchPrompt(
    '用户的原始主题：\n\n{topic}\n\n判断是否需要澄清。如果需要，输出 ``TOOL`` 调用 ``ask_user``；否则输出 ``FINISH`` 并给出精炼后的研究目标。',
    { topic: input.question }
  );
  const result = streamText({
    model: createNeuinkModel(input.settings),
    ...generationSettings(input.settings),
    system,
    prompt: user,
    abortSignal: input.abortSignal
  });
  let full = '';
  for await (const chunk of result.textStream) {
    full += chunk;
    input.onDelta?.(chunk);
  }
  return extractLabeledBody(full, 'FINISH') || stripLeadingLabel(full) || input.question;
}

async function decomposeTopic(
  topic: string,
  input: ResearchPipelineInput
): Promise<ResearchOutlineItem[]> {
  const system = await loadResearchPrompt('research.decompose.system');
  const user = renderResearchPrompt(
    '精炼后的研究主题：\n\n{topic}\n\n现在产出约 {num_subtopics} 个子主题的 JSON 大纲。',
    {
      num_subtopics: input.numSubtopics,
      topic
    }
  );
  const { text } = await generateText({
    model: createNeuinkModel(input.settings),
    ...generationSettings(input.settings),
    system,
    prompt: user,
    abortSignal: input.abortSignal
  });
  return parseOutlineJson(text, input.numSubtopics);
}

export function extractLabeledBody(text: string, label: string): string | null {
  const marker = `\`\`${label}\`\``;
  const index = text.indexOf(marker);
  if (index < 0) {
    return null;
  }
  return text.slice(index + marker.length).trim();
}

export function stripLeadingLabel(text: string): string {
  return text
    .replace(/^\s*(``(THINK|TOOL|FINISH|APPEND|OUTLINE)``)\s*/i, '')
    .trim();
}

export function parseOutlineJson(text: string, expectedCount: number): ResearchOutlineItem[] {
  const jsonText = extractOutlineJson(text) ?? text;
  const parsed = parseJsonObject(jsonText);
  const rawItems = parsed?.sub_topics;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return [{ title: compact(text, 120), overview: undefined }];
  }
  const items = rawItems
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      title: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : '未命名子主题',
      overview: typeof item.overview === 'string' && item.overview.trim() ? item.overview.trim() : undefined
    }))
    .slice(0, Math.max(expectedCount, 1));
  if (items.length === 0) {
    return [{ title: compact(text, 120), overview: undefined }];
  }
  return items;
}

function extractOutlineJson(text: string): string | null {
  const marker = '``OUTLINE``';
  const index = text.indexOf(marker);
  if (index >= 0) {
    return text.slice(index + marker.length).trim();
  }
  const brace = text.indexOf('{');
  const braceEnd = text.lastIndexOf('}');
  if (brace >= 0 && braceEnd > brace) {
    return text.slice(brace, braceEnd + 1);
  }
  return null;
}

function parseJsonObject(text: string): { sub_topics?: unknown } | null {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as { sub_topics?: unknown };
  } catch {
    const brace = trimmed.indexOf('{');
    const braceEnd = trimmed.lastIndexOf('}');
    if (brace >= 0 && braceEnd > brace) {
      try {
        return JSON.parse(trimmed.slice(brace, braceEnd + 1)) as { sub_topics?: unknown };
      } catch {
        return null;
      }
    }
    return null;
  }
}

function compact(text: string, max: number): string {
  const singleLine = text.replace(/\s+/g, ' ').trim();
  return singleLine.length > max ? `${singleLine.slice(0, max)}…` : singleLine;
}
