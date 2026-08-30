import { generateText } from 'ai';

import type { LlmProfile } from '@/shared/ipc/assistantApi';
import type { AgentToolId } from '@/shared/types/agentRuntime';

import { createNeuinkModel, generationSettings } from '../sdk/provider';

export type ModelTaskPlan = {
  intent: 'general' | 'note_edit' | 'entry_meta_edit' | 'workspace_search' | 'paper_read' | 'external_search';
  requiredToolIds: AgentToolId[];
  fields?: Array<'title' | 'description'>;
  noteAction?: 'append' | 'delete' | 'patch' | 'prepend' | 'replace';
  sourcePolicy?: 'active_context_only' | 'mixed' | 'none' | 'sciverse_only' | 'workspace_only';
};

const TOOL_IDS: AgentToolId[] = [
  'create_entry', 'search_segments', 'read_segment_content', 'read_entry_assistant_context',
  'search_sciverse_evidence', 'read_sciverse_content', 'read_current_note', 'read_note',
  'note.propose_create', 'note.propose_patch', 'segment_note.propose_patch',
  'entry.propose_meta_patch', 'tag.propose_change', 'skill.search', 'skill.load', 'task.run_subagent'
];

export async function planAssistantTask(question: string, settings: LlmProfile): Promise<ModelTaskPlan | null> {
  try {
    const result = await generateText({
      ...generationSettings(settings),
      model: createNeuinkModel(settings),
      system: 'You are a task planner. Return JSON only. Select only tools from the supplied list. Never invent tool ids. Do not execute tools.',
      prompt: `User request:\n${question}\n\nAvailable tools:\n${TOOL_IDS.join(', ')}\n\nReturn exactly {"intent":"general|note_edit|entry_meta_edit|workspace_search|paper_read|external_search","requiredToolIds":[],"fields":[],"noteAction":"append|delete|patch|prepend|replace","sourcePolicy":"active_context_only|mixed|none|sciverse_only|workspace_only"}. Choose the minimum tools needed. For changing an Entry title or description use entry_meta_edit and entry.propose_meta_patch. For changing a Markdown note use note_edit and read_current_note plus note.propose_patch.`,
    });
    const match = result.text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const value = JSON.parse(match[0]) as Partial<ModelTaskPlan>;
    if (!['general', 'note_edit', 'entry_meta_edit', 'workspace_search', 'paper_read', 'external_search'].includes(value.intent ?? '')) return null;
    const requiredToolIds = Array.isArray(value.requiredToolIds)
      ? value.requiredToolIds.filter((id): id is AgentToolId => TOOL_IDS.includes(id as AgentToolId))
      : [];
    const fields = Array.isArray(value.fields) ? value.fields.filter((field): field is 'title' | 'description' => field === 'title' || field === 'description') : undefined;
    return { intent: value.intent as ModelTaskPlan['intent'], requiredToolIds: [...new Set(requiredToolIds)], fields, noteAction: value.noteAction, sourcePolicy: value.sourcePolicy };
  } catch {
    return null;
  }
}
