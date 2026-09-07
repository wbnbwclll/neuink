import { describe, expect, it } from 'vitest';

import type { AssistantTaskPlan } from '@/shared/types/assistant';
import { DEFAULT_AGENT_RUNTIME_SETTINGS } from '@/shared/lib/agentRuntimeSettings';
import type { OrchestratedTask } from './taskOrchestrator';

import {
  buildInvocationPlanForContract,
  compileAssistantExecutionContract
} from './executionContract';

function orchestration(
  patch: Partial<Omit<OrchestratedTask, 'plan'>> & { plan?: Partial<AssistantTaskPlan> } = {}
): OrchestratedTask {
  const { plan: planPatch, ...orchestrationPatch } = patch;
  const plan: AssistantTaskPlan = {
    attachments: [],
    capabilities: ['synthesize'],
    citationPolicy: 'none',
    confidence: 0.95,
    deliverables: ['chat_answer'],
    evidencePolicy: 'none',
    intent: 'general_qa',
    missing: [],
    needsCurrentNote: false,
    needsDocumentContext: false,
    needsNoteProposal: false,
    needsSegmentSearch: false,
    rationale: 'Structured orchestration result.',
    request: 'request',
    target: { kind: 'chat_only' },
    steps: [{ dependsOn: [], id: 'answer', kind: 'synthesize_answer' }],
    ...planPatch
  };
  return {
    orchestratorAgentId: 'task-orchestrator-agent',
    plan,
    requiredToolIds: [],
    skillIdsToLoad: [],
    sourcePolicy: 'none',
    ...orchestrationPatch
  };
}

describe('assistant execution contracts', () => {
  it('preserves the orchestrator tool and source decisions without keyword rerouting', () => {
    const contract = compileAssistantExecutionContract(orchestration({
      plan: {
        citationPolicy: 'required',
        evidencePolicy: 'required',
        intent: 'paper_summary',
        needsDocumentContext: true,
        target: { entryId: 'entry-1', kind: 'chat_only' }
      },
      requiredToolIds: ['read_entry_assistant_context'],
      sourcePolicy: 'active_context_only'
    }));

    expect(contract.plan.intent).toBe('paper_summary');
    expect(contract.requiredToolIds).toEqual(['read_entry_assistant_context']);
    expect(contract.sourcePolicy).toBe('active_context_only');
    expect(contract.failurePolicy).toBe('stop');
  });

  it('keeps note creation separate from editing an active note', () => {
    const contract = compileAssistantExecutionContract(orchestration({
      plan: {
        capabilities: ['propose_note'],
        deliverables: ['note_create_proposal'],
        intent: 'note_create',
        needsNoteProposal: true,
        noteAction: 'create',
        target: { entryId: 'entry-1', kind: 'markdown_note' }
      },
      requiredToolIds: ['note.propose_create'],
      sourcePolicy: 'active_context_only'
    }));

    expect(contract.plan.intent).toBe('note_create');
    expect(contract.plan.missing).toEqual([]);
    expect(contract.requiredToolIds).toEqual(['note.propose_create']);
  });

  it('preserves Skill selections made by the orchestrator', () => {
    const contract = compileAssistantExecutionContract(orchestration({
      skillIdsToLoad: ['reading-note']
    }));

    expect(contract.skillIdsToLoad).toEqual(['reading-note']);
  });

  it('exposes direct Entry creation as an explicit workspace write', () => {
    const contract = compileAssistantExecutionContract(orchestration({
      plan: {
        capabilities: ['create_entry'],
        deliverables: ['entry_created'],
        intent: 'entry_create',
        target: { kind: 'new_entry' }
      },
      requiredToolIds: ['create_entry']
    }));
    const invocation = buildInvocationPlanForContract(
      contract,
      DEFAULT_AGENT_RUNTIME_SETTINGS
    );

    expect(invocation.enabledToolIds).toContain('create_entry');
    expect(invocation.writePolicy).toBe('workspace_write');
  });

  it('allows general answers only when no required evidence or side effect exists', () => {
    const contract = compileAssistantExecutionContract(orchestration());

    expect(contract.requiredToolIds).toEqual([]);
    expect(contract.failurePolicy).toBe('allow_general_fallback');
  });
});
