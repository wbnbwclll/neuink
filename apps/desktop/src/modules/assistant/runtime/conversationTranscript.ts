import type { ModelMessage } from 'ai';
import type { ConversationMessage } from '@/shared/ipc/assistantApi';

/**
 * Renders persisted conversation history as real model turns, so the run's
 * messages carry the whole conversation rather than a truncated tail string.
 *
 * Tool calls and tool results are deliberately NOT replayed. They are stale (the
 * workspace may have been edited and PDFs re-parsed since), and their [Sx]
 * markers were assigned by a previous run's SourceLedger, so replaying them would
 * present old output as current evidence and remap citations onto unrelated
 * sources. Everything that still matters — task state, pending proposals, the
 * last diagram, mention maps — is re-derived from the same history by the
 * harness brief.
 */
export function renderConversationTranscript(
  history: readonly ConversationMessage[]
): ModelMessage[] {
  const turns: ModelMessage[] = [];
  for (const message of history.slice(lastMemoryCheckpointIndex(history) + 1)) {
    const text = withoutCitationMarkers(message.content);
    // A message may carry only tool parts, leaving no text; an empty turn is rejected by providers.
    if (!text) continue;
    const previous = turns[turns.length - 1];
    if (previous && previous.role === message.role && typeof previous.content === 'string') {
      previous.content = `${previous.content}\n\n${text}`;
      continue;
    }
    turns.push(message.role === 'user'
      ? { role: 'user', content: text }
      : { role: 'assistant', content: text });
  }
  // Providers require the transcript to open with the user's turn.
  while (turns.length > 0 && turns[0].role !== 'user') turns.shift();
  return turns;
}

/** A `memory` part is the conversation's own record that everything up to and including its
 *  message has been summarized. That checkpoint reaches the model through the harness brief, and
 *  the same boundary is what `shouldUpdateConversationMemory` counts from — so the turns start
 *  after it. Otherwise a "compacted" conversation would keep sending the summarized text in full
 *  and the summary would cost context instead of saving it.
 *  Returns -1 when no checkpoint exists, leaving the whole history in the transcript.
 *  This is the single definition of that boundary: the usage ring measures from it too. */
export function lastMemoryCheckpointIndex(history: readonly ConversationMessage[]) {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index].parts?.some(part => part.type === 'memory')) return index;
  }
  return -1;
}

/**
 * A historical marker would either resolve against the current run's ledger and
 * silently point at a different source, or fail contract verification. Removing
 * it is the only outcome that is wrong neither way.
 */
function withoutCitationMarkers(content: string) {
  return content.replace(/\[S\d+\]/g, '').trim();
}
