import type {
  AssistantConversationMemory,
  ConversationMessage,
  LlmProfile
} from '@/shared/ipc/assistantApi';

import { lastMemoryCheckpointIndex } from '../runtime/conversationTranscript';
import type { RunBudget } from '../agent-core';
import { formatConversationMemory, summarizeConversation } from '../sdk/conversationSummary';

export { formatConversationMemory };

export function appendConversationMemory(
  harnessBrief: string,
  history: ConversationMessage[]
) {
  const memory = formatConversationMemory(latestConversationMemory(history));
  return memory ? `${harnessBrief}\n\nConversation Memory Checkpoint:\n${memory}` : harnessBrief;
}

export function latestConversationMemory(history: ConversationMessage[]) {
  for (const message of [...history].reverse()) {
    const part = [...(message.parts ?? [])].reverse()
      .find((candidate) => candidate.type === 'memory');
    if (part?.type === 'memory') return part.memory;
  }
  return null;
}

/** Keep small conversations in their original form. Summarize before the transcript tail would
 *  drop older turns; never pay for a checkpoint per greeting. */
export function shouldUpdateConversationMemory(history: ConversationMessage[], question: string, answer: string) {
  const unsummarized = history.slice(lastMemoryCheckpointIndex(history) + 1);
  const chars = unsummarized.reduce((total, message) => total + message.content.length + 16, question.length + answer.length);
  return chars >= 8_000;
}

export function buildConversationTail(
  history: ConversationMessage[],
  maxChars = 16_000
) {
  const selected: string[] = [];
  let used = 0;
  for (const message of [...history].reverse()) {
    const content = message.content.trim();
    if (!content) continue;
    const role = message.role === 'user' ? 'User' : 'Assistant';
    const remaining = maxChars - used;
    if (remaining <= role.length + 4) break;
    const bounded = content.slice(0, Math.min(content.length, remaining - role.length - 2));
    selected.push(`${role}: ${bounded}`);
    used += role.length + bounded.length + 2;
    if (used >= maxChars) break;
  }
  return selected.reverse().join('\n\n');
}

/**
 * The conversation-level compaction: it summarizes the whole conversation and returns the
 * checkpoint that a `memory` part carries. Both the end-of-run memory update and the user's
 * manual compact go through here, and both delegate the actual summarizing to
 * `summarizeConversation` — the same function the loop's usage-triggered projection calls.
 */
export async function updateConversationMemory({
  budget,
  abortSignal,
  answer,
  history,
  pendingProposalCount,
  question,
  settings,
  sourceCount
}: {
  budget?: RunBudget;
  abortSignal?: AbortSignal;
  answer: string;
  history: ConversationMessage[];
  pendingProposalCount: number;
  question: string;
  settings: LlmProfile;
  sourceCount: number;
}): Promise<AssistantConversationMemory> {
  const summary = await summarizeConversation({
    abortSignal,
    budget,
    dropped: conversationText(history, question, answer),
    previous: latestConversationMemory(history),
    settings
  });
  const materialMessageCount = history.filter((message) => !message.message_id.startsWith('client-')).length;
  return {
    ...summary,
    message_count: materialMessageCount + 2,
    pending_proposal_count: pendingProposalCount,
    source_count: sourceCount,
    updated_at: new Date().toISOString()
  };
}

/** Only the counters live here; the prompt, schema and validation belong to the summarizer. */
function conversationText(history: ConversationMessage[], question: string, answer: string) {
  return [
    `Recent durable conversation tail:\n${buildConversationTail(history, 12_000) || 'none'}`,
    `Newest user request:\n${question}`,
    `Newest assistant outcome:\n${answer.slice(0, 8_000) || '(no textual answer)'}`
  ].join('\n\n');
}
