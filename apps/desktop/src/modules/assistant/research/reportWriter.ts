import { streamText } from 'ai';

import {
  conversationSourceKey,
  isSciverseConversationSource
} from '@/shared/ipc/assistantApi';
import type {
  ConversationSourceLink,
  LlmProfile,
  ScopeSnapshot
} from '@/shared/ipc/assistantApi';
import type { ResearchProgressEvent } from '@/shared/types/research';

import { createNeuinkModel, generationSettings } from '../shared/sdk/provider';
import { CitationManager } from './citationManager';
import { emitResearchProgress } from './progressEvents';
import { loadResearchPrompt, renderResearchPrompt } from './prompts';
import type { ReportSectionPlan, ResearchedBlock } from './types';

// 每个小节喂给写作器的研究知识上限，防止超长证据撑爆上下文。
const SECTION_KNOWLEDGE_CHARS = 12_000;
// 小节正文 LLM 生成失败时的降级切片长度。
const SECTION_FALLBACK_CHARS = 6_000;

export type WriteReportOptions = {
  abortSignal?: AbortSignal;
  citations: CitationManager;
  onDelta?: (delta: string) => void;
  onProgress?: (event: ResearchProgressEvent) => void;
  researchedBlocks: ResearchedBlock[];
  scope?: ScopeSnapshot | null;
  settings: LlmProfile;
  topic: string;
};

export type WriteReportResult = {
  markdown: string;
  sourceLinks: ConversationSourceLink[];
};

export async function writeReport(options: WriteReportOptions): Promise<WriteReportResult> {
  const {
    abortSignal,
    citations,
    onDelta,
    onProgress,
    researchedBlocks,
    settings,
    topic
  } = options;
  const sections = buildReportSections(researchedBlocks);
  const parts: string[] = [];
  const emit = (chunk: string) => {
    if (!chunk) {
      return;
    }
    parts.push(chunk);
    onDelta?.(chunk);
  };

  // 标题 + 引言
  emit(`# ${topic}\n\n## 引言\n\n`);
  emitResearchProgress(onProgress, 'report', '正在撰写引言');
  const intro = await streamGeneratedText({
    abortSignal,
    settings,
    system: await loadResearchPrompt('research.report.intro.system'),
    user: renderResearchPrompt(await loadResearchPrompt('research.report.intro.user'), {
      subtopic_count: String(sections.length),
      topic
    }),
    onDelta: emit
  });
  emit(`${intro}\n\n`);

  // 每个子主题一节
  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index];
    emit(`## ${index + 1}. ${section.title}\n\n`);
    emitResearchProgress(onProgress, 'report', `正在撰写「${section.title}」`);
    const block = researchedBlocks.find(
      (researched) => researched.block.blockId === section.blockIds[0]
    );
    const knowledge = block?.knowledge ?? '';
    let body = '';
    try {
      body = await streamGeneratedText({
        abortSignal,
        settings,
        system: await loadResearchPrompt('research.report.section.system'),
        user: renderResearchPrompt(await loadResearchPrompt('research.report.section.user'), {
          section_intent: section.intent || '（无概述）',
          section_knowledge: knowledge.slice(0, SECTION_KNOWLEDGE_CHARS),
          section_title: section.title
        }),
        onDelta: emit
      });
    } catch {
      body = knowledge.slice(0, SECTION_FALLBACK_CHARS);
    }
    if (!body.trim()) {
      body = knowledge.trim()
        ? knowledge.slice(0, SECTION_FALLBACK_CHARS)
        : '（本节未收集到可用证据。）';
    }
    emit(`${body}\n\n`);
  }

  // 结论
  emit('## 结论\n\n');
  emitResearchProgress(onProgress, 'report', '正在撰写结论');
  const conclusion = await streamGeneratedText({
    abortSignal,
    settings,
    system: await loadResearchPrompt('research.report.conclusion.system'),
    user: renderResearchPrompt(await loadResearchPrompt('research.report.conclusion.user'), {
      subtopic_count: String(sections.length),
      topic
    }),
    onDelta: emit
  });
  emit(`${conclusion}\n\n`);

  // 引文重编号 + 参考资料
  emitResearchProgress(onProgress, 'report', '正在汇总参考资料');
  const linked = linkifyCitations(parts.join(''), citations);
  const referenceList = `## 参考资料\n\n${renderReferenceList(linked.sourceLinks)}`;
  const markdown = `${linked.text}\n${referenceList}`;
  onDelta?.(referenceList);
  return { markdown, sourceLinks: linked.sourceLinks };
}

// ---------------------------------------------------------------------------
// 纯辅助（可单元测试）
// ---------------------------------------------------------------------------

export function buildReportSections(researchedBlocks: ResearchedBlock[]): ReportSectionPlan[] {
  return researchedBlocks.map((researched) => ({
    id: researched.block.blockId,
    title: researched.block.subTopic,
    intent: researched.block.overview,
    blockIds: [researched.block.blockId]
  }));
}

const CITATION_MARKER_RE = /\[(CIT-\d+-\d{2})\]/g;

export type LinkifiedReport = {
  text: string;
  sourceLinks: ConversationSourceLink[];
};

// 把报告正文里的 [CIT-x-yy] 按首次出现顺序重编号为 [S1..Sn]（对应 qna.ts
// normalizeCitedSources 的重编号语义），并顺带去重汇总全部来源。未知的
// CIT 标记（模型幻觉）直接丢弃，避免留下悬空引用。
export function linkifyCitations(
  markdown: string,
  citations: CitationManager
): LinkifiedReport {
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const match of markdown.matchAll(CITATION_MARKER_RE)) {
    const citationId = match[1];
    if (!seen.has(citationId)) {
      seen.add(citationId);
      ordered.push(citationId);
    }
  }

  const sourceLinks: ConversationSourceLink[] = [];
  const sourceIndexByKey = new Map<string, number>();
  const citationToIndexes = new Map<string, number[]>();
  for (const citationId of ordered) {
    const indexes: number[] = [];
    for (const source of citations.getCitation(citationId)?.sources ?? []) {
      const key = conversationSourceKey(source);
      let sourceIndex = sourceIndexByKey.get(key);
      if (sourceIndex === undefined) {
        sourceIndex = sourceLinks.length;
        sourceLinks.push(source);
        sourceIndexByKey.set(key, sourceIndex);
      }
      if (!indexes.includes(sourceIndex)) {
        indexes.push(sourceIndex);
      }
    }
    citationToIndexes.set(citationId, indexes);
  }

  const text = markdown.replace(CITATION_MARKER_RE, (_full, citationId: string) => {
    const indexes = citationToIndexes.get(citationId) ?? [];
    if (indexes.length === 0) {
      return '';
    }
    return indexes.map((index) => `[S${index + 1}]`).join('');
  });
  return { text, sourceLinks };
}

export function renderReferenceList(sourceLinks: ConversationSourceLink[]): string {
  if (sourceLinks.length === 0) {
    return '（本报告未收集到可引用的来源。）';
  }
  return sourceLinks
    .map((source, index) => `[S${index + 1}] ${referenceSourceLabel(source)}`)
    .join('\n');
}

export function referenceSourceLabel(source: ConversationSourceLink): string {
  if (isSciverseConversationSource(source)) {
    const location =
      source.page_no != null
        ? `p.${source.page_no}`
        : source.offset != null
          ? `offset ${source.offset}`
          : `doc ${source.doc_id}`;
    return `${source.title}, Sciverse, ${location}`;
  }
  return `${source.entry_title}, p.${source.page_idx + 1}`;
}

// 检查报告是否包含所有规划小节标题；缺失时在末尾补占位（防御性兜底，
// writeReport 逐节生成时标题必然存在，此函数主要服务测试与未来改造）。
export function repairSectionCoverage(
  report: string,
  sections: ReportSectionPlan[]
): { missing: ReportSectionPlan[]; repaired: string } {
  const missing = sections.filter((section) => {
    const pattern = new RegExp(
      `^##\\s+(\\d+\\.\\s*)?${escapeRegExp(section.title)}$`,
      'm'
    );
    return !pattern.test(report);
  });
  if (missing.length === 0) {
    return { missing: [], repaired: report };
  }
  const repaired = `${report}\n\n${missing
    .map((section) => `## ${section.title}\n\n（本节未生成正文。）`)
    .join('\n\n')}`;
  return { missing, repaired };
}

// ---------------------------------------------------------------------------
// 内部实现
// ---------------------------------------------------------------------------

async function streamGeneratedText(options: {
  abortSignal?: AbortSignal;
  settings: LlmProfile;
  system: string;
  user: string;
  onDelta?: (delta: string) => void;
}): Promise<string> {
  const result = streamText({
    abortSignal: options.abortSignal,
    ...generationSettings(options.settings),
    model: createNeuinkModel(options.settings),
    prompt: options.user,
    system: options.system
  });
  let full = '';
  for await (const chunk of result.textStream) {
    full += chunk;
    options.onDelta?.(chunk);
  }
  return full.trim();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
