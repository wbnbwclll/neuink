import type { ResearchQueueStats, TopicBlock, TopicBlockStatus } from './types';

// 对应 DeepTutor data_structures.py `DynamicTopicQueue`。最大队列长度
// （max_length）由 ResearchExecutionPolicy.queueLimit 决定，超过即拒绝
// APPEND；findSimilar 用 Jaccard + 序列相似度做模糊去重。

// 默认模糊匹配阈值：0.85 可靠捕获近似重复标题（大小写 / 标点 / 词序
// 微调），同时放行真正不同的子主题。
export const DEFAULT_TOPIC_SIMILARITY_THRESHOLD = 0.85;

const _TOPIC_TOKEN_RE = /[\p{L}\p{N}]+/gu;
const _TOPIC_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'by',
  'for',
  'from',
  'in',
  'into',
  'of',
  'on',
  'or',
  'the',
  'to',
  'vs',
  'with'
]);

export function normalizeTopic(text: string): string {
  return (text ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function topicTokens(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const raw of normalizeTopic(text).match(_TOPIC_TOKEN_RE) ?? []) {
    let token = raw;
    if (!token || _TOPIC_STOPWORDS.has(token)) {
      continue;
    }
    // 极简词干：足以对齐 "basics"/"basic"，无需引入 NLP 依赖。
    if (token.length > 4 && token.endsWith('ies')) {
      token = `${token.slice(0, -3)}y`;
    } else if (token.length > 3 && token.endsWith('s')) {
      token = token.slice(0, -1);
    }
    tokens.add(token);
  }
  return tokens;
}

// difflib.SequenceMatcher.ratio 的 JS 移植（Ratcliff-Obershelp 最长公共
// 子串递归匹配）：2 * 匹配字符数 / (len(a) + len(b))。
function sequenceRatio(left: string, right: string): number {
  if (left === right) {
    return left ? 1 : 0;
  }
  const matched = matchLength(left, right, 0, left.length, 0, right.length);
  return (2 * matched) / (left.length + right.length);
}

function matchLength(
  left: string,
  right: string,
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): number {
  if (aStart >= aEnd || bStart >= bEnd) {
    return 0;
  }
  const [i, j, size] = findLongestMatch(left, right, aStart, aEnd, bStart, bEnd);
  if (size === 0) {
    return 0;
  }
  const before = matchLength(left, right, aStart, i, bStart, j);
  const after = matchLength(left, right, i + size, aEnd, j + size, bEnd);
  return size + before + after;
}

function findLongestMatch(
  left: string,
  right: string,
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): [number, number, number] {
  let bestI = aStart;
  let bestJ = bStart;
  let bestSize = 0;
  for (let i = aStart; i < aEnd; i += 1) {
    for (let j = bStart; j < bEnd; j += 1) {
      let size = 0;
      while (
        i + size < aEnd &&
        j + size < bEnd &&
        left.charCodeAt(i + size) === right.charCodeAt(j + size)
      ) {
        size += 1;
      }
      if (size > bestSize) {
        bestI = i;
        bestJ = j;
        bestSize = size;
      }
    }
  }
  return [bestI, bestJ, bestSize];
}

function topicSimilarity(left: string, right: string): number {
  const leftNorm = normalizeTopic(left);
  const rightNorm = normalizeTopic(right);
  if (!leftNorm || !rightNorm) {
    return 0;
  }
  if (leftNorm === rightNorm) {
    return 1;
  }

  const sequenceScore = sequenceRatio(leftNorm, rightNorm);
  const leftTokens = topicTokens(leftNorm);
  const rightTokens = topicTokens(rightNorm);
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return sequenceScore;
  }

  const union = new Set([...leftTokens, ...rightTokens]);
  const overlap = new Set([...leftTokens].filter((token) => rightTokens.has(token)));
  const jaccard = overlap.size / Math.max(1, union.size);
  const containment = overlap.size / Math.max(1, Math.min(leftTokens.size, rightTokens.size));
  let tokenScore = jaccard;
  if (leftTokens.size >= 2 && rightTokens.size >= 2 && jaccard >= 0.5) {
    tokenScore = Math.max(tokenScore, containment * 0.95);
  }
  return Math.max(sequenceScore, tokenScore);
}

export class DynamicTopicQueue {
  private readonly blocks: TopicBlock[] = [];
  private blockCounter = 0;
  readonly maxLength: number | null;

  constructor(readonly researchId: string, maxLength?: number | null) {
    this.maxLength =
      typeof maxLength === 'number' && Number.isFinite(maxLength) && maxLength > 0
        ? Math.floor(maxLength)
        : null;
  }

  addBlock(subTopic: string, overview: string): TopicBlock {
    if (this.isFull()) {
      throw new Error(
        `Queue has reached maximum capacity (${this.maxLength}), cannot add new topic.`
      );
    }
    this.blockCounter += 1;
    const block: TopicBlock = {
      blockId: `block_${this.blockCounter}`,
      subTopic,
      overview,
      status: 'pending',
      iterationCount: 0,
      toolTraces: []
    };
    this.blocks.push(block);
    return block;
  }

  hasTopic(subTopic: string): boolean {
    const target = normalizeTopic(subTopic);
    if (!target) {
      return false;
    }
    return this.blocks.some((block) => normalizeTopic(block.subTopic) === target);
  }

  isFull(): boolean {
    return this.maxLength !== null && this.blocks.length >= this.maxLength;
  }

  findSimilar(subTopic: string, threshold = DEFAULT_TOPIC_SIMILARITY_THRESHOLD): TopicBlock | null {
    const target = normalizeTopic(subTopic);
    if (!target) {
      return null;
    }
    let best: { score: number; block: TopicBlock } | null = null;
    for (const block of this.blocks) {
      const candidate = normalizeTopic(block.subTopic);
      if (!candidate) {
        continue;
      }
      if (candidate === target) {
        return block;
      }
      const score = topicSimilarity(target, candidate);
      if (score >= threshold && (best === null || score > best.score)) {
        best = { score, block };
      }
    }
    return best ? best.block : null;
  }

  appendChild(parent: TopicBlock | null, subTopic: string, overview = ''): TopicBlock | null {
    if (this.isFull()) {
      return null;
    }
    this.blockCounter += 1;
    const block: TopicBlock = {
      blockId: `block_${this.blockCounter}`,
      subTopic,
      overview,
      status: 'pending',
      iterationCount: 0,
      toolTraces: [],
      parentBlockId: parent ? parent.blockId : null
    };
    this.blocks.push(block);
    return block;
  }

  listTopics(): string[] {
    return this.blocks.map((block) => block.subTopic);
  }

  getPendingBlock(): TopicBlock | null {
    return this.blocks.find((block) => block.status === 'pending') ?? null;
  }

  getBlockById(blockId: string): TopicBlock | null {
    return this.blocks.find((block) => block.blockId === blockId) ?? null;
  }

  markResearching(blockId: string): boolean {
    const block = this.getBlockById(blockId);
    if (block) {
      block.status = 'researching';
      return true;
    }
    return false;
  }

  markCompleted(blockId: string): boolean {
    const block = this.getBlockById(blockId);
    if (block) {
      block.status = 'completed';
      return true;
    }
    return false;
  }

  markFailed(blockId: string): boolean {
    const block = this.getBlockById(blockId);
    if (block) {
      block.status = 'failed';
      return true;
    }
    return false;
  }

  getAllCompletedBlocks(): TopicBlock[] {
    return this.blocks.filter((block) => block.status === 'completed');
  }

  getAllPendingBlocks(): TopicBlock[] {
    return this.blocks.filter((block) => block.status === 'pending');
  }

  isAllCompleted(): boolean {
    return this.blocks.length > 0 && this.blocks.every((block) => block.status === 'completed');
  }

  getStatistics(): ResearchQueueStats {
    const counts: Record<TopicBlockStatus, number> = {
      pending: 0,
      researching: 0,
      completed: 0,
      failed: 0
    };
    let totalToolCalls = 0;
    for (const block of this.blocks) {
      counts[block.status] += 1;
      totalToolCalls += block.toolTraces.length;
    }
    return {
      totalBlocks: this.blocks.length,
      pending: counts.pending,
      researching: counts.researching,
      completed: counts.completed,
      failed: counts.failed,
      totalToolCalls
    };
  }

  getBlocks(): TopicBlock[] {
    return [...this.blocks];
  }
}
