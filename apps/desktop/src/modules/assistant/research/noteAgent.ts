import { generateText } from 'ai';

import type { LlmProfile } from '@/shared/ipc/assistantApi';

import { createNeuinkModel, generationSettings } from '../sdk/provider';
import { loadResearchPrompt } from './prompts';

// 对应 DeepTutor pipeline.py `_summarise_tool_result`：把一次证据工具的
// 原始返回压缩成 1-3 句、可直接进入引文摘要的精炼文本。失败时回退到
// 原始输出的前段切片，保证研究循环不被注记副车拖垮。

export const NOTE_RAW_INPUT_TRUNCATE_CHARS = 8000;
export const NOTE_FALLBACK_SLICE_CHARS = 600;

export type SummarizeToolResultInput = {
  abortSignal?: AbortSignal;
  maxTokens?: number | null;
  query: string;
  rawOutput: unknown;
  settings: LlmProfile;
  toolName: string;
};

export async function summarizeToolResult(input: SummarizeToolResultInput): Promise<string> {
  const { abortSignal, maxTokens, query, rawOutput, settings, toolName } = input;
  const cleaned = serializeRawOutput(rawOutput).trim();
  if (!cleaned) {
    return '';
  }

  try {
    const system = await loadResearchPrompt('research.note.system');
    if (!system) {
      return sliceFallback(cleaned);
    }
    const user = [
      '工具：',
      `{tool_name}`,
      '',
      '检索查询：',
      `{query}`,
      '',
      '工具原始输出：',
      `{raw_answer}`,
      '',
      '请输出压缩后的研究摘要。'
    ].join('\n');
    const rendered = renderNotePrompt(user, {
      query,
      raw_answer: cleaned.slice(0, NOTE_RAW_INPUT_TRUNCATE_CHARS),
      tool_name: toolName
    });
    const { text } = await generateText({
      abortSignal,
      model: createNeuinkModel(settings),
      ...generationSettings(settings),
      maxOutputTokens: maxTokens ?? 1500,
      prompt: rendered,
      system
    });
    const summary = stripNoteLabel(text).trim();
    return summary || sliceFallback(cleaned);
  } catch {
    return sliceFallback(cleaned);
  }
}

function serializeRawOutput(output: unknown): string {
  if (typeof output === 'string') {
    return output;
  }
  try {
    return JSON.stringify(output);
  } catch {
    return String(output);
  }
}

function sliceFallback(cleaned: string): string {
  return cleaned.slice(0, NOTE_FALLBACK_SLICE_CHARS);
}

function stripNoteLabel(text: string): string {
  return text.replace(/^\s*(``FINISH``)\s*/i, '').trim();
}

export function renderNotePrompt(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (result, [key, value]) => result.split(`{${key}}`).join(value),
    template
  );
}
