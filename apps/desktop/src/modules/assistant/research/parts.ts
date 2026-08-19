import type { AssistantMessagePart } from '@/shared/ipc/assistantApi';
import type {
  ResearchOutline,
  ResearchProgressEvent
} from '@/shared/types/research';

export function buildResearchParts({
  outline,
  progress = []
}: {
  outline?: ResearchOutline | null;
  progress?: ResearchProgressEvent[];
}): AssistantMessagePart[] {
  const parts: AssistantMessagePart[] = [];
  for (const event of progress) {
    parts.push({
      progress: event,
      type: 'research-progress'
    });
  }
  if (outline) {
    parts.push({
      outline,
      type: 'research-outline'
    });
  }
  return parts;
}
