import type { AgentRuntimeSettings, AgentToolId } from '@/shared/types/agentRuntime';
import type { AgentInvocationPlan, AssistantTaskPlan } from '@/shared/types/assistant';

import type { OrchestratedTask } from './taskOrchestrator';

export type AssistantExecutionContract = {
  failurePolicy: NonNullable<AgentInvocationPlan['failurePolicy']>;
  plan: AssistantTaskPlan;
  requiredToolIds: AgentToolId[];
  skillIdsToLoad: string[];
  sourcePolicy: NonNullable<AgentInvocationPlan['sourcePolicy']>;
};

export function compileAssistantExecutionContract(
  orchestration: OrchestratedTask
): AssistantExecutionContract {
  const plan = orchestration.plan;
  return {
    failurePolicy:
      orchestration.requiredToolIds.length > 0 ||
      plan.needsNoteProposal ||
      plan.evidencePolicy === 'required'
        ? 'stop'
        : 'allow_general_fallback',
    plan,
    requiredToolIds: orchestration.requiredToolIds,
    skillIdsToLoad: orchestration.skillIdsToLoad,
    sourcePolicy: orchestration.sourcePolicy
  };
}

export function buildInvocationPlanForContract(
  contract: AssistantExecutionContract,
  runtimeSettings: AgentRuntimeSettings,
  preferredAgentId?: string | null
): AgentInvocationPlan {
  const enabledToolIds = toolsForContract(contract, runtimeSettings.mainAssistant.enabledToolIds);
  const configured = new Set(runtimeSettings.mainAssistant.enabledToolIds);
  const missing = contract.requiredToolIds.filter((toolId) => !configured.has(toolId));
  return {
    enabledToolIds,
    failurePolicy: contract.failurePolicy,
    mainAssistantId: preferredAgentId ?? runtimeSettings.mainAssistant.id,
    missing,
    mode: 'agent_execute',
    noteEditMode: contract.plan.noteAction && contract.plan.noteAction !== 'create'
      ? contract.plan.noteAction
      : undefined,
    rationale: contract.plan.rationale,
    requiredToolIds: contract.requiredToolIds,
    skillIdsToLoad: contract.skillIdsToLoad,
    sourcePolicy: contract.sourcePolicy,
    subagentTasks: [],
    writePolicy: contract.plan.intent === 'entry_create'
      ? 'workspace_write'
      : contract.plan.needsNoteProposal || isProposalIntent(contract.plan.intent)
        ? 'proposal_only'
        : 'chat_only'
  };
}

function toolsForContract(contract: AssistantExecutionContract, configuredIds: AgentToolId[]) {
  const configured = new Set(configuredIds);
  const exposed = new Set<AgentToolId>(contract.requiredToolIds);
  if (contract.sourcePolicy === 'active_context_only') {
    exposed.add('read_entry_assistant_context');
    exposed.add('read_segment_content');
    exposed.add('read_current_note');
    exposed.add('read_note');
  } else if (contract.sourcePolicy === 'workspace_only') {
    exposed.add('search_segments');
    exposed.add('read_segment_content');
    exposed.add('read_entry_assistant_context');
  } else if (contract.sourcePolicy === 'sciverse_only') {
    exposed.add('search_sciverse_evidence');
    exposed.add('read_sciverse_content');
  } else if (contract.sourcePolicy === 'mixed') {
    exposed.add('search_segments');
    exposed.add('read_segment_content');
    exposed.add('read_entry_assistant_context');
    exposed.add('search_sciverse_evidence');
    exposed.add('read_sciverse_content');
  }
  if (contract.skillIdsToLoad.length > 0) {
    exposed.add('skill.load');
  }
  return [...exposed].filter((toolId) => configured.has(toolId));
}

function isProposalIntent(intent: AssistantTaskPlan['intent']) {
  return intent === 'note_create' ||
    intent === 'note_update' ||
    intent === 'segment_note_update' ||
    intent === 'entry_meta_update' ||
    intent.startsWith('tag_');
}
