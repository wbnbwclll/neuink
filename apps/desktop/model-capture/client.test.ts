import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonSchema, tool } from 'ai';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import type { LlmProfile } from '../src/shared/ipc/assistantApi';
import { createAgentDriver } from '../src/modules/assistant/sdk/agentDriver';
import { createModelCapture } from './client';

vi.mock('@tauri-apps/plugin-http', () => ({ fetch: vi.fn() }));

const profile = { id: 'capture-test', model: 'fixture', base_url: 'https://example.invalid/v1',
  api_key: 'synthetic-secret', max_context_length: 32_000 } as LlmProfile;
const post = vi.fn<typeof fetch>();
const dumps = () => post.mock.calls.map(([, init]) => ({
  kind: new Headers(init?.headers).get('x-neuink-capture-kind'),
  id: new Headers(init?.headers).get('x-neuink-capture-id'),
  payload: JSON.parse(init?.body as string)
}));

function reply() {
  const events = [
    { id: 'fixture', created: 0, model: 'fixture', choices: [{ index: 0, delta: { role: 'assistant', content: 'hello' }, finish_reason: null }] },
    { id: 'fixture', created: 0, model: 'fixture', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 12, completion_tokens: 1, total_tokens: 13 } }
  ];
  return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n',
    { headers: { 'content-type': 'text/event-stream' } });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('DEV', true);
  vi.stubEnv('MODE', 'development');
  vi.stubGlobal('fetch', post);
  post.mockResolvedValue(new Response(null, { status: 204 }));
  vi.mocked(tauriFetch).mockImplementation(async () => reply());
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('model capture integration', () => {
  it('pairs four captures through the real driver and provider without consuming its stream', async () => {
    const delta = vi.fn();
    const driver = createAgentDriver({ settings: profile, system: 'fixture system', onDelta: delta,
      tools: { read_note: tool({ description: 'Read a note', inputSchema: jsonSchema({ type: 'object', properties: {} }) }) } });
    const result = await driver.turn([{ role: 'user', content: 'fixture question' }]);
    expect(result.text).toBe('hello');
    expect(delta.mock.calls.flat().join('')).toBe('hello');
    await vi.waitFor(() => expect(dumps()).toHaveLength(4));
    expect(new Set(dumps().map(dump => dump.id)).size).toBe(1);
    expect(dumps().map(dump => dump.kind).sort()).toEqual(['sdk-request', 'sdk-response', 'wire-request', 'wire-response']);
    const captured = Object.fromEntries(dumps().map(dump => [dump.kind, dump.payload]));
    expect(captured['sdk-request']).toMatchObject({ model: 'fixture', turn: 1, finalTurn: false,
      tools: { read_note: { inputSchema: { type: 'object', properties: {} } } } });
    expect(captured['wire-request'].body.messages).toContainEqual({ role: 'user', content: 'fixture question' });
    expect(captured['wire-request'].headers.authorization).toBe('[redacted]');
    expect(captured['wire-response'].body.eventStream.at(-1)).toBe('[DONE]');
    expect(captured['sdk-response']).toMatchObject({ text: 'hello', finishReason: 'stop', turn: 1 });
    expect(JSON.stringify(dumps())).not.toContain(profile.api_key);
    expect(tauriFetch).toHaveBeenCalledOnce();
  });

  it.each([[false, 'production'], [true, 'test']] as const)('keeps DEV=%s MODE=%s free of capture traffic', async (dev, mode) => {
    vi.stubEnv('DEV', dev);
    vi.stubEnv('MODE', mode);
    const driver = createAgentDriver({ settings: profile, system: 'fixture', tools: {} });
    expect((await driver.turn([{ role: 'user', content: 'fixture' }])).text).toBe('hello');
    expect(tauriFetch).toHaveBeenCalledOnce();
    expect(post).not.toHaveBeenCalled();
  });

  it('keeps model output intact when the capture endpoint fails', async () => {
    post.mockRejectedValue(new Error('fixture capture offline'));
    const driver = createAgentDriver({ settings: profile, system: 'fixture', tools: {} });
    expect((await driver.turn([{ role: 'user', content: 'fixture' }])).text).toBe('hello');
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(4));
  });

  it('owns turn counters per driver and records final-turn metadata', async () => {
    const first = createModelCapture();
    const second = createModelCapture();
    const request = { system: 'fixture', messages: [], tools: {}, toolChoice: 'auto' };
    first(profile, request);
    first(profile, { ...request, toolChoice: 'none' });
    second(profile, request);
    await vi.waitFor(() => expect(dumps()).toHaveLength(3));
    expect(dumps().map(dump => [dump.payload.turn, dump.payload.finalTurn])).toEqual([[1, false], [2, true], [1, false]]);
  });
});
