import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { resolveLlmApiProtocol, type LlmProfile } from '../src/shared/ipc/assistantApi';
import { createCaptureContext, dumpSdkRequest, dumpSdkResponse, type PromptDump, type ResponseDump } from './promptDump';
import { capturingFetch } from './wireCapture';

type ModelRequest = Pick<PromptDump, 'system' | 'messages' | 'tools' | 'toolChoice'> & PromptDump['generation'];
type ModelResponse = Omit<ResponseDump, 'model' | 'turn' | 'finalTurn'>;

/** One session per driver; concurrent agents never share a turn counter or transport. */
export function createModelCapture() {
  let turn = 0;
  return (settings: LlmProfile, request: ModelRequest) => {
    const currentTurn = ++turn;
    const context = createCaptureContext(currentTurn);
    if (!context) return undefined;

    const metadata = { model: settings.model, turn: currentTurn, finalTurn: request.toolChoice === 'none' };
    dumpSdkRequest(context, {
      ...metadata,
      protocol: resolveLlmApiProtocol(settings.api_protocol),
      system: request.system,
      messages: request.messages,
      tools: request.tools,
      toolChoice: request.toolChoice,
      generation: { maxOutputTokens: request.maxOutputTokens, temperature: request.temperature, topP: request.topP }
    });
    return {
      fetch: capturingFetch(tauriFetch, context.captureId),
      response: (response: ModelResponse) => dumpSdkResponse(context, { ...metadata, ...response })
    };
  };
}
