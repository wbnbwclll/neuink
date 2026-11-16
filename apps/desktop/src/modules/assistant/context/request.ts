import type { ModelMessage } from 'ai';
import type { RunContextPolicy, WorkspaceContext } from '@/shared/types/modelContext';
import { contextBaseline, contextJson, runPolicyMessage, workspaceMessage } from './workspace';

/** The sole assembly point for new user turns. Earlier model messages are never rewritten. */
export function prepareContextRequest(options: {
  history: readonly ModelMessage[];
  workspace?: WorkspaceContext;
  policy?: RunContextPolicy;
  question: string;
}) {
  const previous = contextBaseline(options.history);
  const inputMessages: ModelMessage[] = [];
  if (options.workspace && contextJson(previous.workspace) !== contextJson(options.workspace))
    inputMessages.push(workspaceMessage(options.workspace));
  if (options.policy && contextJson(previous.policy) !== contextJson(options.policy))
    inputMessages.push(runPolicyMessage(options.policy));
  inputMessages.push({ role: 'user', content: options.question });
  return { messages: [...options.history, ...inputMessages], inputMessages, historyLength: options.history.length };
}
