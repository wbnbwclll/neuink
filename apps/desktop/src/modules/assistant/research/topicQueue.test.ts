import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TOPIC_SIMILARITY_THRESHOLD,
  DynamicTopicQueue,
  normalizeTopic
} from './topicQueue';

describe('normalizeTopic', () => {
  it('trims, lowercases and collapses whitespace', () => {
    expect(normalizeTopic('  Transformer   Attention  ')).toBe('transformer attention');
  });
});

describe('DynamicTopicQueue.addBlock', () => {
  it('assigns sequential block ids and pending status', () => {
    const queue = new DynamicTopicQueue('t1', 5);
    const first = queue.addBlock('A', '');
    const second = queue.addBlock('B', 'overview');
    expect(first.blockId).toBe('block_1');
    expect(second.blockId).toBe('block_2');
    expect(second.overview).toBe('overview');
    expect(queue.getPendingBlock()?.blockId).toBe('block_1');
  });

  it('throws when the queue is full', () => {
    const queue = new DynamicTopicQueue('t1', 2);
    queue.addBlock('A', '');
    queue.addBlock('B', '');
    expect(() => queue.addBlock('C', '')).toThrow(/capacity/);
  });

  it('is never full when maxLength is null', () => {
    const queue = new DynamicTopicQueue('t1', null);
    for (let index = 0; index < 100; index += 1) {
      queue.addBlock(`topic-${index}`, '');
    }
    expect(queue.isFull()).toBe(false);
  });
});

describe('DynamicTopicQueue.findSimilar', () => {
  const queue = new DynamicTopicQueue('t1', 10);
  queue.addBlock('transformer attention mechanism', '');
  queue.addBlock('quantum computing', '');

  it('matches near-duplicate titles after normalization + stemming', () => {
    expect(queue.findSimilar('Transformer attention mechanisms')).not.toBeNull();
  });

  it('returns the exact block for identical normalized titles', () => {
    expect(queue.findSimilar('Transformer attention mechanism')?.blockId).toBe('block_1');
  });

  it('rejects genuinely different topics', () => {
    expect(queue.findSimilar('neural networks')).toBeNull();
  });

  it('is configurable via threshold', () => {
    // 阈值调高后弱相似不再命中
    expect(queue.findSimilar('transformer attention mechanism', 1)).not.toBeNull();
    expect(queue.findSimilar('transformer attention mechanism', 0.999)).not.toBeNull();
  });

  it('defaults the threshold to 0.85', () => {
    expect(DEFAULT_TOPIC_SIMILARITY_THRESHOLD).toBe(0.85);
  });
});

describe('DynamicTopicQueue.appendChild', () => {
  it('adds a pending child referencing its parent', () => {
    const queue = new DynamicTopicQueue('t1', 10);
    const parent = queue.addBlock('parent', '');
    const child = queue.appendChild(parent, 'child', '');
    expect(child).not.toBeNull();
    expect(child!.parentBlockId).toBe(parent.blockId);
    expect(queue.getBlockById(child!.blockId)?.status).toBe('pending');
  });

  it('returns null when full', () => {
    const queue = new DynamicTopicQueue('t1', 1);
    const parent = queue.addBlock('parent', '');
    expect(queue.appendChild(parent, 'child', '')).toBeNull();
  });
});

describe('DynamicTopicQueue lifecycle', () => {
  it('tracks statuses and statistics', () => {
    const queue = new DynamicTopicQueue('t1', 10);
    queue.addBlock('A', '');
    queue.addBlock('B', '');
    queue.markResearching('block_1');
    queue.markCompleted('block_1');
    queue.markFailed('block_2');
    const stats = queue.getStatistics();
    expect(stats).toEqual({
      totalBlocks: 2,
      pending: 0,
      researching: 0,
      completed: 1,
      failed: 1,
      totalToolCalls: 0
    });
    expect(queue.isAllCompleted()).toBe(false);
  });

  it('reports all-completed only when every block completed', () => {
    const queue = new DynamicTopicQueue('t1', 10);
    queue.addBlock('A', '');
    queue.addBlock('B', '');
    queue.markCompleted('block_1');
    queue.markCompleted('block_2');
    expect(queue.isAllCompleted()).toBe(true);
  });
});
