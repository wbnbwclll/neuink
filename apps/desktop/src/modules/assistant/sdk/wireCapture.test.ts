import { beforeEach, describe, expect, it, vi } from 'vitest';

const dumpWire = vi.fn();
vi.mock('./promptDump', () => ({
  dumpWire: (...args: unknown[]) => dumpWire(...args)
}));

import { capturingFetch } from './wireCapture';

const captureFor = (kind: string) =>
  dumpWire.mock.calls.find(([captured]) => captured === kind)?.[2] as Record<string, unknown> | undefined;

describe('capturingFetch', () => {
  beforeEach(() => dumpWire.mockClear());

  it('captures both directions while leaving the response readable for the SDK', async () => {
    const payload = { choices: [{ message: { content: 'hi' } }] };
    const base = vi.fn(async () => new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }));
    const wrapped = capturingFetch(base as never, 'cap-1');

    const response = await wrapped('https://example.test/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: 'Bearer secret', 'x-api-key': 'also-secret', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'm', messages: [] })
    });

    // The whole point of cloning: the SDK still gets the untouched body.
    expect(await response.json()).toEqual(payload);

    expect(base).toHaveBeenCalledTimes(1);
    const request = captureFor('wire-request');
    expect(request?.url).toBe('https://example.test/v1/chat/completions');
    expect(request?.method).toBe('POST');
    expect(request?.body).toEqual({ model: 'm', messages: [] });

    await vi.waitFor(() => expect(captureFor('wire-response')).toBeDefined());
    expect(captureFor('wire-response')?.status).toBe(200);
    expect(captureFor('wire-response')?.body).toEqual(payload);
  });

  it('never writes credential headers to disk', async () => {
    const base = vi.fn(async () => new Response('{}', { status: 200 }));
    const wrapped = capturingFetch(base as never, 'cap-2');

    await wrapped('https://example.test/v1/chat', {
      method: 'POST',
      headers: { Authorization: 'Bearer secret', 'X-Api-Key': 'secret', 'x-goog-api-key': 'secret', 'content-type': 'application/json' },
      body: '{}'
    });

    const headers = captureFor('wire-request')?.headers as Record<string, string>;
    expect(Object.values(headers)).not.toContain('Bearer secret');
    expect(Object.values(headers)).not.toContain('secret');
    expect(headers['content-type']).toBe('application/json');
  });

  it('splits a Server-Sent Events reply into readable events', async () => {
    const chunks = [
      { choices: [{ delta: { content: 'he' } }] },
      { choices: [{ delta: { content: 'llo' } }] }
    ];
    const stream = `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}`).join('\n\n')}\n\ndata: [DONE]\n\n`;
    const base = vi.fn(async () => new Response(stream, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' }
    }));
    const wrapped = capturingFetch(base as never, 'cap-sse');

    // The SDK must still receive the untouched stream.
    expect(await (await wrapped('https://example.test/v1/chat', { method: 'POST' })).text()).toBe(stream);

    await vi.waitFor(() => expect(captureFor('wire-response')).toBeDefined());
    expect(captureFor('wire-response')?.body).toEqual({ eventStream: [...chunks, '[DONE]'] });
  });

  it('keeps a non-JSON body verbatim instead of failing the request', async () => {
    const base = vi.fn(async () => new Response('data: [DONE]', { status: 200 }));
    const wrapped = capturingFetch(base as never, 'cap-3');

    const response = await wrapped('https://example.test/v1/chat', { method: 'POST', body: 'not json' });

    expect(await response.text()).toBe('data: [DONE]');
    expect(captureFor('wire-request')?.body).toBe('not json');
  });
});
