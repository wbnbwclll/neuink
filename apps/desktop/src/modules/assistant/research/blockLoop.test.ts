import { describe, expect, it } from 'vitest';

import {
  decideAppendTopic,
  extractBlockKnowledge,
  toolQuery
} from './blockLoop';
import { DynamicTopicQueue } from './topicQueue';
import type { TopicBlock } from './types';

describe('decideAppendTopic', () => {
  function setup(titles: string[], queueLimit = 10) {
    const queue = new DynamicTopicQueue('t1', queueLimit);
    for (const title of titles) {
      queue.addBlock(title, '');
    }
    return { parent: queue.getBlockById('block_1')!, queue };
  }

  it('rejects an empty title', () => {
    const { parent, queue } = setup(['root']);
    const result = decideAppendTopic({ parentBlock: parent, queue, title: '  ' });
    expect(result.accepted).toBe(false);
    expect(result.message).toContain('缺少标题');
  });

  it('rejects when the queue is full', () => {
    const { parent, queue } = setup(['root'], 1);
    const result = decideAppendTopic({ parentBlock: parent, queue, title: '新主题' });
    expect(result.accepted).toBe(false);
    expect(result.message).toContain('队列已满');
  });

  it('rejects near-duplicate topics', () => {
    const { parent, queue } = setup(['transformer attention mechanism']);
    const result = decideAppendTopic({
      parentBlock: parent,
      queue,
      title: 'Transformer attention mechanisms'
    });
    expect(result.accepted).toBe(false);
    expect(result.message).toContain('过于相似');
  });

  it('appends a new child block when accepted', () => {
    const { parent, queue } = setup(['root']);
    const result = decideAppendTopic({
      overview: '覆盖注意力变体',
      parentBlock: parent,
      queue,
      title: 'quantum computing'
    });
    expect(result.accepted).toBe(true);
    expect(result.block?.blockId).toBe('block_2');
    expect(result.block?.parentBlockId).toBe('block_1');
    expect(result.block?.overview).toBe('覆盖注意力变体');
    expect(queue.getBlockById('block_2')?.status).toBe('pending');
  });
});

describe('extractBlockKnowledge', () => {
  it('extracts the body after the FINISH label', () => {
    expect(extractBlockKnowledge('``THINK`` 想\n``FINISH`` 这是小结')).toBe('这是小结');
  });

  it('strips a leading protocol label when no FINISH marker exists', () => {
    expect(extractBlockKnowledge('``THINK`` 纯思考输出')).toBe('纯思考输出');
    expect(extractBlockKnowledge('直接输出正文')).toBe('直接输出正文');
  });
});

describe('toolQuery', () => {
  it('prefers the query field', () => {
    expect(toolQuery('search_segments', { query: '  RAG  ' })).toBe('RAG');
  });

  it('falls back to read-segment uid', () => {
    expect(toolQuery('read_segment_content', { segment_uid: 'seg-1' })).toBe('seg-1');
  });

  it('falls back to sciverse doc id', () => {
    expect(toolQuery('read_sciverse_content', { doc_id: 'd1' })).toBe('d1');
  });

  it('falls back to the tool name for catalog reads', () => {
    expect(toolQuery('get_sciverse_metadata_catalog', {})).toBe(
      'get_sciverse_metadata_catalog'
    );
  });
});
