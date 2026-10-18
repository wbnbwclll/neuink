import {
  appendConversationMessages,
  type AssistantConversationMemory,
  type Conversation,
  type ConversationMessage,
  type LlmProfile
} from '@/shared/ipc/assistantApi';

import { updateConversationMemory } from '../harness/conversationMemory';
import { lastMemoryCheckpointIndex } from '../runtime/conversationTranscript';
import { buildAssistantMessageParts, uniqueSourceLinks } from './assistantPanelState';

/**
 * Manual compaction: the same checkpoint the loop writes when it crosses the trigger ratio,
 * requested by the user instead of by the budget. Both go through `updateConversationMemory`
 * and therefore through the one summarizer in `sdk/conversationSummary`. The conversation keeps
 * every original message — the newest message carrying a `memory` part becomes the boundary that
 * `renderConversationTranscript` and `shouldUpdateConversationMemory` both count from.
 */
export async function compactConversation({
  abortSignal,
  conversation,
  root,
  settings
}: {
  abortSignal?: AbortSignal;
  conversation: Conversation;
  root: string;
  settings: LlmProfile;
}): Promise<Conversation> {
  const inputs = compactionInputs(conversation.messages);
  const memory = await updateConversationMemory({
    abortSignal,
    history: conversation.messages,
    settings,
    ...inputs
  });
  return appendConversationMessages(root, conversation.id, [compactionCheckpointMessage(memory)]);
}

/** A checkpoint with nothing after it would only summarize a summary, so require real turns
 *  since the newest one. */
export function canCompactConversation(history: readonly ConversationMessage[]) {
  return history
    .slice(lastMemoryCheckpointIndex(history) + 1)
    .some(message => message.content.trim().length > 0);
}

/** Nothing here is inferred: the newest real request and outcome, the sources the transcript
 *  actually cites, and the proposals still waiting for the user. */
export function compactionInputs(history: readonly ConversationMessage[]) {
  const newest = (role: ConversationMessage['role']) =>
    [...history].reverse().find(message => message.role === role && message.content.trim());
  return {
    answer: newest('assistant')?.content ?? '',
    pendingProposalCount: history.filter(message =>
      (message.note_proposals ?? []).some(proposal =>
        proposal.status === 'pending' || proposal.status === 'applying'
      )
    ).length,
    question: newest('user')?.content ?? '',
    sourceCount: uniqueSourceLinks(history.flatMap(message => message.source_links ?? [])).length
  };
}

/** Deliberately has no text content: the notice is a checkpoint marker, not something the
 *  assistant said, and an empty body keeps it out of answers, exports and reply readers. */
export function compactionCheckpointMessage(memory: AssistantConversationMemory) {
  return {
    content: '',
    parts: buildAssistantMessageParts({ content: '', memory }),
    role: 'assistant' as const
  };
}
