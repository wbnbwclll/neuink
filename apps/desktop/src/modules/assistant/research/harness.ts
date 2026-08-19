import type {
  AssistantToolTraceEvent,
  ConversationMessage,
  LlmProfile,
  ScopeSnapshot
} from '@/shared/ipc/assistantApi';
import type {
  AssistantTaskPlan,
  AssistantTaskState
} from '@/shared/types/assistant';
import type { ResearchOutline, ResearchProgressEvent } from '@/shared/types/research';
import type { AgentRuntimeSettings } from '@/shared/types/agentRuntime';
import { createCompiledTaskState, transitionTaskState } from '../shared/runtime/taskState';
import type { GroundedAnswer } from '@/shared/types/assistant';
import {
  AssistantHarnessError,
  createAgentRun,
  emitHarnessEvent,
  errorMessage,
  finishAgentRun,
  isAbortError,
  markRunningNodesAwaitingUser,
  markRunningNodesCanceled,
  markRunningNodesFailed,
  throwIfAborted,
  upsertRunNode
} from '../shared/harness/runState';
import { AUTO_SUBTOPICS, runResearchPipeline } from './orchestrator';

export type RunResearchHarnessOptions = {
  abortSignal?: AbortSignal;
  confirmedOutline?: ResearchOutline | null;
  conversationHistory?: ConversationMessage[];
  conversationId?: string;
  onDelta?: (delta: string) => void;
  onToolEvent?: (event: AssistantToolTraceEvent) => void;
  question: string;
  root: string;
  runtimeSettings: AgentRuntimeSettings;
  scope?: ScopeSnapshot | null;
  settings: LlmProfile;
};

export async function runResearchHarness(
  options: RunResearchHarnessOptions
): Promise<GroundedAnswer> {
  const {
    abortSignal,
    confirmedOutline,
    conversationHistory = [],
    conversationId,
    onDelta,
    onToolEvent,
    question,
    root,
    runtimeSettings,
    scope,
    settings
  } = options;
  const research = runtimeSettings.researchAssistant.research;
  const depth = research.depth;
  const numSubtopics =
    depth === 'manual' && research.manualSubtopics != null
      ? research.manualSubtopics
      : AUTO_SUBTOPICS[depth];
  const runId = `research-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const agentRun = createAgentRun(runId);
  let activeTaskState: AssistantTaskState | undefined;

  try {
    throwIfAborted(abortSignal);
    upsertRunNode(agentRun, {
      id: `${runId}-plan`,
      kind: 'planner',
      inputSummary: `goal=${question.slice(0, 180)}`,
      status: 'running',
      title: 'Plan deep-research outline'
    });
    emitHarnessEvent(onToolEvent, {
      id: `${runId}-plan`,
      status: 'running',
      summary: confirmedOutline
        ? 'Resuming deep research with a confirmed outline.'
        : 'Rephrasing the topic and decomposing it into a user-confirmable outline.',
      toolName: 'research.plan'
    });

    const plan = researchTaskPlan(question);
    activeTaskState = createCompiledTaskState({
      conversationId: conversationId ?? 'local',
      request: question,
      spec: plan
    });

    const progressEvents: ResearchProgressEvent[] = [];
    const pipeline = await runResearchPipeline({
      abortSignal,
      blockMaxIterations: research.blockMaxIterations,
      confirmedOutline,
      depth,
      maxQuestionsPerRound: 3,
      maxRounds: research.rephraseMaxRounds,
      mode: 'report',
      noteMaxTokens: research.noteMaxTokens,
      numSubtopics,
      onDelta: (delta) => onDelta?.(delta),
      onProgress: (event) => {
        progressEvents.push(event);
        emitHarnessEvent(onToolEvent, {
          id: `${runId}-${event.stage}`,
          status: 'done',
          summary: event.summary,
          toolName: `research.${event.stage}`
        });
      },
      onToolEvent,
      question,
      root,
      runtimeSettings,
      scope,
      settings
    });

    if (pipeline.outline) {
      markRunningNodesAwaitingUser(agentRun, question);
      upsertRunNode(agentRun, {
        id: `${runId}-plan`,
        kind: 'planner',
        outputSummary: `outline=${pipeline.outline.items.length} subtopics`,
        sourceCount: 0,
        status: 'succeeded',
        title: 'Plan deep-research outline'
      });
      const awaitingTaskState = transitionTaskState(
        activeTaskState,
        'awaiting_user',
        'compile'
      );
      agentRun.resumeFromNodeId = `${runId}-plan`;
      return {
        agentRun: finishAgentRun(agentRun, 'succeeded'),
        answer: pipeline.answer,
        plan,
        researchOutline: pipeline.outline,
        researchProgress: pipeline.progressEvents,
        sources: [],
        taskState: awaitingTaskState
      };
    }

    throwIfAborted(abortSignal);
    upsertRunNode(agentRun, {
      id: `${runId}-report`,
      kind: 'main_assistant',
      inputSummary: `outline=${confirmedOutline?.items.length ?? 0} subtopics`,
      outputSummary: `answer=${pipeline.answer.length}`,
      status: 'succeeded',
      title: 'Run deep-research report pipeline'
    });
    emitHarnessEvent(onToolEvent, {
      id: `${runId}-report`,
      status: 'done',
      summary: 'Deep-research report generated.',
      toolName: 'research.report'
    });
    const completedTaskState = transitionTaskState(
      activeTaskState,
      'completed',
      'verify'
    );
    return {
      agentRun: finishAgentRun(agentRun, 'succeeded'),
      answer: pipeline.answer,
      plan,
      researchProgress: pipeline.progressEvents,
      sources: pipeline.sources ?? [],
      taskState: completedTaskState
    };
  } catch (error) {
    const message = errorMessage(error);
    const canceled = isAbortError(error);
    if (canceled) {
      markRunningNodesCanceled(agentRun, message);
      finishAgentRun(agentRun, 'canceled');
    } else {
      markRunningNodesFailed(agentRun, message);
      finishAgentRun(agentRun, 'failed');
    }
    const failedTask = activeTaskState
      ? transitionTaskState(
          activeTaskState,
          canceled ? 'cancelled' : 'failed',
          activeTaskState.phase
        )
      : undefined;
    throw new AssistantHarnessError(message, agentRun, error, failedTask);
  }
}

function researchTaskPlan(question: string): AssistantTaskPlan {
  return {
    attachments: [],
    capabilities: ['search_evidence', 'synthesize'],
    citationPolicy: 'required',
    confidence: 0.9,
    deliverables: ['chat_answer'],
    evidencePolicy: 'required',
    intent: 'paper_search',
    missing: [],
    needsCurrentNote: false,
    needsDocumentContext: false,
    needsNoteProposal: false,
    needsSegmentSearch: true,
    rationale: 'Deep-research pipeline: rephrase → decompose → parallel blocks → citation-annotated report.',
    request: question,
    steps: [],
    target: { kind: 'chat_only' }
  };
}
