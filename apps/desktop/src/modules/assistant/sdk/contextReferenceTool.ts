import { jsonSchema, tool } from 'ai';
import type { ConversationMessage, ConversationSourceLink, AssistantToolTraceEvent } from '@/shared/ipc/assistantApi';
import type { AssistantContext } from '@/shared/types/assistant';
import { selectionContextRef } from '../context/observation';
import { AgentToolNotExecutedError } from '../agent-core';

/** Reads only context the user already supplied to this conversation; never opens an arbitrary file. */
export function createContextReferenceTool(options: {
  assistantContext?: AssistantContext | null;
  history: readonly ConversationMessage[];
  signal?: AbortSignal;
  addSource: (source: ConversationSourceLink) => number;
  emit: (event: AssistantToolTraceEvent) => void;
  observe: (output: unknown) => void;
}) {
  return tool({
    description: 'Read a frozen pinned selection by its context_ref, or a prior host artifact using latest_diagram or latest_arxiv_search. Historical content is a snapshot, not current authorization or a fresh note read. Paginate using exact next_read. For live papers and notes use the document/note reading tools.',
    inputSchema: jsonSchema<{ context_ref: string; offset?: number; limit?: number }>({ type: 'object', additionalProperties: false,
      properties: { context_ref: { type: 'string' }, offset: { type: 'integer', minimum: 0 },
        limit: { type: 'integer', minimum: 100, maximum: 16000 } }, required: ['context_ref'] }),
    execute: async (input, call) => {
      const signal = call.abortSignal ?? options.signal;
      signal?.throwIfAborted();
      const offset = input.offset ?? 0, limit = input.limit ?? 8000;
      let text: string | undefined, kind = 'selection';
      let source: ConversationSourceLink | undefined;
      const items = [...options.assistantContext?.items ?? [], ...options.history.flatMap(message =>
        (message.parts ?? []).flatMap(part => part.type === 'context-snapshot' ? part.items : []))];
      if (input.context_ref.startsWith('selection:')) {
        for (const item of items) {
          if (item.kind !== 'segment' || await selectionContextRef(item) !== input.context_ref) continue;
          text = item.text;
          source = { entry_id: item.entryId, entry_title: item.entryTitle, segment_uid: item.segmentUid,
            page_idx: item.pageIdx, quote: item.text.slice(0, 4000) };
          break;
        }
      } else {
        const parts = [...options.history].reverse().flatMap(message => [...message.parts ?? []].reverse());
        if (input.context_ref === 'latest_diagram') {
          const part = parts.find(part => part.type === 'tool-result' && part.diagram);
          if (part?.type === 'tool-result' && part.diagram) {
            text = part.diagram.code; kind = 'historical_diagram';
          }
        } else if (input.context_ref === 'latest_arxiv_search') {
          const part = parts.find(part => part.type === 'tool-result' && part.researchSearch);
          if (part?.type === 'tool-result' && part.researchSearch) {
            text = JSON.stringify(part.researchSearch); kind = 'historical_search';
          }
        }
      }
      signal?.throwIfAborted();
      if (text === undefined) throw new AgentToolNotExecutedError('The context reference is unavailable. Do not invent the missing selection or artifact.', 'TOOL_INVALID_ARGUMENTS');
      const marker = source ? options.addSource(source) : undefined;
      const next = offset + limit;
      const output = { kind, context_ref: input.context_ref, snapshot_only: true,
        ...(marker ? { marker: `[S${marker}]` } : {}), text: text.slice(offset, next),
        total_chars: text.length, more: next < text.length,
        next_read: next < text.length ? { context_ref: input.context_ref, offset: next, limit } : null };
      options.observe(output);
      options.emit({ id: call.toolCallId, toolName: 'read_context_reference', status: 'done', input,
        summary: 'Read the requested context snapshot.', ...(source ? { sources: [source] } : {}) });
      return output;
    }
  });
}
