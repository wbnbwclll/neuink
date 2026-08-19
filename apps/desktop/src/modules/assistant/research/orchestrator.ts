import { generateText, streamText } from 'ai';

import type { LlmProfile } from '@/shared/ipc/assistantApi';
import type { ResearchDepth, ResearchMode } from '@/shared/types/agentRuntime';
import type {
  ResearchOutline,
  ResearchOutlineItem,
  ResearchProgressEvent
} from '@/shared/types/research';

import { createNeuinkModel, generationSettings } from '../sdk/provider';
import { loadResearchPrompt, renderResearchPrompt } from './prompts';

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
  numSubtopics: number;
  onDelta?: (delta: string) => void;
  onProgress?: (event: ResearchProgressEvent) => void;
  question: string;
  settings: LlmProfile;
};

export type ResearchPipelineResult = {
  answer: string;
  outline?: ResearchOutline;
  progressEvents: ResearchProgressEvent[];
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

  // 第二轮：逐块研究 + 报告。阶段 B 先给出结构骨架，
  // 阶段 C 接入 DynamicTopicQueue / 并行研究块 / 引文标注。
  const outline = input.confirmedOutline;
  emit({
    stage: 'research',
    summary: `开始研究 ${outline.items.length} 个子主题（${outline.depth} 深度）`
  });
  const sections = outline.items
    .map((item, index) => {
      const intro = item.overview ? `${item.overview}\n\n` : '';
      return `## ${index + 1}. ${item.title}\n\n${intro}（该子主题的逐块检索与证据引用将在阶段 C 落地。）`;
    })
    .join('\n\n');
  const answer = `# ${outline.topic}\n\n## 引言\n\n本报告由研究助手生成，覆盖 ${outline.items.length} 个子主题。\n\n${sections}\n\n## 结论\n\n（结论将在各子主题研究完成后生成。）\n\n## 参考资料\n\n（各子主题的引用来源将在研究阶段收集并在此列出。）`;
  emit({
    stage: 'done',
    summary: '研究完成（阶段 B 骨架）',
    completedBlocks: outline.items.length,
    totalBlocks: outline.items.length
  });
  input.onDelta?.(answer);
  return { answer, progressEvents };
}

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
