import { dumpWire } from './promptDump';

/** Matches what the AI SDK provider packages accept for their `fetch` setting. */
export type FetchLike = (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>;

// Headers that carry credentials; the wire dump must never write these to disk.
const CREDENTIAL_HEADERS = ['authorization', 'x-api-key', 'api-key', 'x-goog-api-key', 'proxy-authorization'];

/**
 * Wraps the transport so the actual HTTP exchange is captured, not just the arguments the AI SDK
 * was given. Everything here is best-effort: a capture failure must never break the request.
 */
export function capturingFetch(base: FetchLike, captureId: string): FetchLike {
  return async (input, init) => {
    captureRequest(captureId, input, init);
    const response = await base(input, init);
    captureResponse(captureId, response);
    return response;
  };
}

function captureRequest(captureId: string, input: URL | RequestInfo, init?: RequestInit) {
  try {
    dumpWire('wire-request', captureId, {
      url: requestUrl(input),
      method: init?.method ?? (input instanceof Request ? input.method : 'GET'),
      headers: redact(toHeaderRecord(init?.headers)),
      body: parseBody(init?.body)
    });
  } catch {
    // Ignored by design; capture is never allowed to disturb the request.
  }
}

function captureResponse(captureId: string, response: Response) {
  try {
    if (typeof response?.clone !== 'function') {
      return;
    }
    // Cloning tees the stream, so the SDK still reads the untouched original.
    const clone = response.clone();
    void clone.text()
      .then((body) => dumpWire('wire-response', captureId, {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: renderResponseBody(response, body)
      }))
      .catch(() => undefined);
  } catch {
    // Ignored by design.
  }
}

/**
 * Streaming replies are Server-Sent Events, which JSON cannot represent as anything but one
 * unreadable escaped line. Split them back into their individual events so each chunk is legible;
 * the payloads themselves are untouched.
 */
function renderResponseBody(response: Response, body: string) {
  const contentType = response.headers.get('content-type') ?? '';
  const streaming = contentType.includes('event-stream') || /^data:/.test(body.trimStart());
  return streaming ? { eventStream: parseEventStream(body) } : parseBody(body);
}

function parseEventStream(body: string) {
  return body.split(/\r?\n\r?\n/)
    .filter((block) => block.trim())
    .map((block) => {
      const lines = block.split(/\r?\n/);
      const dataLines = lines.filter((line) => line.startsWith('data:'));
      // Only collapse a block that is nothing but one data line; anything else stays verbatim.
      if (dataLines.length !== 1 || lines.length !== 1) {
        return block;
      }
      const payload = dataLines[0].slice('data:'.length).trimStart();
      try {
        return JSON.parse(payload);
      } catch {
        return payload;
      }
    });
}

function requestUrl(input: URL | RequestInfo) {
  if (typeof input === 'string') {
    return input;
  }
  return input instanceof URL ? input.toString() : input.url;
}

function toHeaderRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) {
    return {};
  }
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  return Array.isArray(headers)
    ? Object.fromEntries(headers)
    : { ...headers };
}

function redact(headers: Record<string, string>) {
  return Object.fromEntries(Object.entries(headers).map(([name, value]) => [
    name,
    CREDENTIAL_HEADERS.includes(name.toLowerCase()) ? '[redacted]' : value
  ]));
}

/**
 * Bodies arrive as JSON strings. Parsing them keeps the dump readable and indented instead of one
 * escaped line; anything unparseable is kept verbatim.
 */
function parseBody(body: unknown) {
  if (body === undefined || body === null) {
    return null;
  }
  if (typeof body !== 'string') {
    return '[non-text body]';
  }
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}
