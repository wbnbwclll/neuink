import { promises as fs } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

import type { Plugin } from 'vite';

// Dev-only sink for the renderer's model captures. The webview has no filesystem access, so each
// payload is POSTed back to the dev server, which writes it to this machine-local folder.
const CAPTURE_ROUTE = '/__neuink/debug/capture';
const OUTPUT_DIRECTORY = 'D:\\Users\\新建文件夹';
const MAX_BODY_BYTES = 32 * 1024 * 1024;

// Ordered so the four files of one round trip sort in flow order.
const CAPTURE_KINDS = ['sdk-request', 'wire-request', 'wire-response', 'sdk-response'] as const;
type CaptureKind = (typeof CAPTURE_KINDS)[number];

// The layer and direction lead the file name so captures of one kind group together in a listing.
const CAPTURE_FILE_PREFIX: Record<CaptureKind, string> = {
  'sdk-request': 'sdk-req',
  'wire-request': 'wire-req',
  'wire-response': 'wire-res',
  'sdk-response': 'sdk-res'
};

export function promptDumpPlugin(): Plugin {
  return {
    name: 'neuink-prompt-dump',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.method !== 'POST' || !isCaptureRequest(request.url)) {
          next();
          return;
        }
        void handleCapture(request, response);
      });
    }
  };
}

function isCaptureRequest(requestUrl?: string) {
  if (!requestUrl) {
    return false;
  }
  try {
    return new URL(requestUrl, 'http://localhost').pathname === CAPTURE_ROUTE;
  } catch {
    return false;
  }
}

async function handleCapture(request: IncomingMessage, response: ServerResponse) {
  try {
    const kind = headerValue(request.headers['x-neuink-capture-kind']);
    const captureId = headerValue(request.headers['x-neuink-capture-id']);
    if (!isCaptureKind(kind) || !isSafeCaptureId(captureId)) {
      response.statusCode = 400;
      response.end('Invalid capture kind or id');
      return;
    }

    const body = await readBody(request);
    const directory = await ensureOutputDirectory();
    const file = path.join(directory, fileNameFor(captureId, kind));
    // Indentation is the only change: same keys, same values, same order, just readable.
    await fs.writeFile(file, JSON.stringify(JSON.parse(body), null, 2), 'utf8');
    // The path is echoed to the dev terminal so the capture is discoverable without opening Explorer.
    console.log(`[neuink] ${kind} captured: ${file}`);
    response.statusCode = 204;
    response.end();
  } catch (error) {
    response.statusCode = 500;
    response.end(error instanceof Error ? error.message : String(error));
  }
}

function isCaptureKind(value: string): value is CaptureKind {
  return (CAPTURE_KINDS as readonly string[]).includes(value);
}

// The id arrives from the client and becomes a file name, so it is restricted to a safe alphabet.
function isSafeCaptureId(value: string) {
  return value.length > 0 && value.length <= 120 && /^[A-Za-z0-9._-]+$/.test(value);
}

function headerValue(header: string | string[] | undefined) {
  return Array.isArray(header) ? header[0] ?? '' : header ?? '';
}

function fileNameFor(captureId: string, kind: CaptureKind) {
  return `${CAPTURE_FILE_PREFIX[kind]}-${captureId}.txt`;
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    size += buffer.byteLength;
    if (size > MAX_BODY_BYTES) {
      throw new Error('Capture exceeds size limit');
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function ensureOutputDirectory() {
  await fs.mkdir(OUTPUT_DIRECTORY, { recursive: true });
  return OUTPUT_DIRECTORY;
}
