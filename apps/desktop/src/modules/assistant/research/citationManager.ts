import { conversationSourceKey } from '@/shared/ipc/assistantApi';
import type { ConversationSourceLink } from '@/shared/ipc/assistantApi';
import type { CitationRecord } from './types';

// 对应 DeepTutor utils/citation_manager.py。为每个研究块生成全局唯一
// CIT-X-XX 引文编号，并登记每条引文的来源（ConversationSourceLink）。
// toSourceLinks 提供去重后的来源列表，供 GroundedAnswer.sources 持久化。

export class CitationManager {
  private readonly citations = new Map<string, CitationRecord>();
  private readonly blockCounters = new Map<string, number>();
  private readonly sourceLinks: ConversationSourceLink[] = [];
  private readonly seenSourceKeys = new Set<string>();

  generateResearchCitationId(blockId: string): string {
    const blockNum = blockNumberFromBlockId(blockId);
    const key = String(blockNum);
    const seq = (this.blockCounters.get(key) ?? 0) + 1;
    this.blockCounters.set(key, seq);
    return `CIT-${blockNum}-${String(seq).padStart(2, '0')}`;
  }

  addCitation(record: CitationRecord): void {
    this.citations.set(record.citationId, record);
    for (const source of record.sources) {
      const key = conversationSourceKey(source);
      if (!this.seenSourceKeys.has(key)) {
        this.seenSourceKeys.add(key);
        this.sourceLinks.push(source);
      }
    }
  }

  citationExists(citationId: string): boolean {
    return this.citations.has(citationId);
  }

  getCitation(citationId: string): CitationRecord | undefined {
    return this.citations.get(citationId);
  }

  getAllCitations(): CitationRecord[] {
    return [...this.citations.values()];
  }

  toSourceLinks(): ConversationSourceLink[] {
    return [...this.sourceLinks];
  }

  getCitationCount(): number {
    return this.citations.size;
  }
}

export function blockNumberFromBlockId(blockId: string): number {
  const index = blockId.lastIndexOf('_');
  if (index < 0) {
    return 0;
  }
  const parsed = Number(blockId.slice(index + 1));
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

// 按 block 序号 + 块内序号排序，供报告阶段的引文出现顺序 / 参考列表排序。
export function citationSortKey(citationId: string): [number, number, number] {
  if (citationId.startsWith('PLAN-')) {
    const num = Number(citationId.slice('PLAN-'.length));
    return [0, 0, Number.isFinite(num) ? num : 0];
  }
  if (citationId.startsWith('CIT-')) {
    const rest = citationId.slice('CIT-'.length);
    const dash = rest.indexOf('-');
    const blockNum = Number(dash < 0 ? rest : rest.slice(0, dash));
    const seqNum = dash < 0 ? 0 : Number(rest.slice(dash + 1));
    return [1, Number.isFinite(blockNum) ? blockNum : 0, Number.isFinite(seqNum) ? seqNum : 0];
  }
  return [999, 999, 999];
}

export function sortCitationIds(citationIds: Iterable<string>): string[] {
  return [...citationIds].sort((left, right) => {
    const [ls, lb, lq] = citationSortKey(left);
    const [rs, rb, rq] = citationSortKey(right);
    return ls - rs || lb - rb || lq - rq;
  });
}
