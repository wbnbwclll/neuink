import { asSchema } from 'ai';

/**
 * Dev-only capture of one model round trip at four points:
 *
 *   sdk-request   the arguments we hand the AI SDK
 *   wire-request  the HTTP request the SDK actually sends
 *   wire-response the raw HTTP response
 *   sdk-response  the SDK's normalized reply
 *
 * Files land in the folder configured in `vite/promptDumpPlugin.ts`. Captures contain the raw
 * system prompt, the transcript (including private note content) and the wire request body. They
 * are a local debugging aid, never a log destination. Credential headers are redacted first.
 */
const CAPTURE_ENDPOINT = '/__neuink/debug/capture';

export type CaptureKind = 'sdk-request' | 'wire-request' | 'wire-response' | 'sdk-response';

export type CaptureContext = { captureId: string };

type ToolDefinitions = Record<string, { description?: string; inputSchema?: unknown }>;

export type PromptDump = {
  model: string;
  protocol: string;
  turn: number;
  finalTurn: boolean;
  system: string;
  messages: unknown;
  toolChoice: string;
  generation: { maxOutputTokens?: number; temperature?: number; topP?: number };
  tools: ToolDefinitions;
};

export type ResponseDump = {
  model: string;
  turn: number;
  finalTurn: boolean;
  text: string;
  finishReason: string;
  usage: unknown;
  calls: unknown;
  messages: unknown;
};

/** `undefined` outside dev, which also leaves the provider's fetch unwrapped. */
export function createCaptureContext(turn: number): CaptureContext | undefined {
  if (!captureEnabled()) {
    return undefined;
  }
  return { captureId: `${new Date().toISOString().replace(/[:.]/g, '-')}-turn-${turn}` };
}

export function dumpSdkRequest(context: CaptureContext, dump: PromptDump): void {
  // Deliberately not awaited and never surfaced: debugging must not alter agent behaviour.
  void resolveToolSchemas(dump.tools)
    .then((tools) => post('sdk-request', context, { ...dump, tools }))
    .catch(() => undefined);
}

export function dumpSdkResponse(context: CaptureContext, dump: ResponseDump): void {
  post('sdk-response', context, dump);
}

export function dumpWire(kind: 'wire-request' | 'wire-response', captureId: string, payload: unknown): void {
  post(kind, { captureId }, payload);
}

function captureEnabled() {
  // Vitest runs with DEV true but no dev server; capture there would only add network noise.
  return import.meta.env.DEV && import.meta.env.MODE !== 'test';
}

function post(kind: CaptureKind, context: CaptureContext, payload: unknown): void {
  if (!captureEnabled()) {
    return;
  }
  try {
    void fetch(CAPTURE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Headers rather than body fields, so the captured payload stays exactly what was sent.
        'x-neuink-capture-kind': kind,
        'x-neuink-capture-id': context.captureId
      },
      body: JSON.stringify(payload)
    }).catch(() => undefined);
  } catch {
    // Ignored by design; a failed capture is not an agent failure.
  }
}

/**
 * The provider never sees the raw `inputSchema`; the SDK converts it to JSON Schema first. Resolve
 * it the same way so the dump matches the wire format instead of zod internals.
 */
async function resolveToolSchemas(tools: ToolDefinitions) {
  const entries = await Promise.all(Object.entries(tools ?? {}).map(async ([name, definition]) => [
    name,
    {
      description: definition?.description,
      inputSchema: await asSchema(definition?.inputSchema as never).jsonSchema
    }
  ] as const));
  return Object.fromEntries(entries);
}
