import type { ConversationMessage } from '@/shared/ipc/assistantApi';
import type { ResearchOutline } from '@/shared/types/research';

export function latestResearchOutlineFromHistory(
  history: ConversationMessage[]
): ResearchOutline | null {
  return (
    [...history]
      .reverse()
      .flatMap((message) => [...(message.parts ?? [])].reverse())
      .find(
        (part): part is Extract<typeof part, { type: 'research-outline' }> =>
          part.type === 'research-outline'
      )?.outline ?? null
  );
}

export function latestResearchRunFromHistory(
  history: ConversationMessage[]
): { resumeFromNodeId: string; runId: string } | null {
  const message = [...history]
    .reverse()
    .find((candidate) =>
      (candidate.parts ?? []).some((part) => part.type === 'research-outline')
    );
  if (!message) {
    return null;
  }
  const run = (message.parts ?? []).find(
    (part): part is Extract<typeof part, { type: 'agent-run' }> =>
      part.type === 'agent-run'
  )?.run;
  if (!run) {
    return null;
  }
  return {
    resumeFromNodeId: run.resumeFromNodeId ?? `${run.id}-plan`,
    runId: run.id
  };
}
