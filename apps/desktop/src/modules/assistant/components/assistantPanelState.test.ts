import { describe, expect, it } from 'vitest';
import type {
  AssistantConversationMemory,
  ConversationMessage,
  LlmProfile
} from '@/shared/ipc/assistantApi';
import { analyzeConversationLength, conversationContextWindow } from './assistantPanelState';

const profile = { max_context_length: 128_000 } as LlmProfile;
const memory: AssistantConversationMemory = {
  decisions: [], entities: [], last_user_goal: null, message_count: 2, open_items: [],
  pending_proposal_count: 0, source_count: 0, summary: 'Summarized.', updated_at: '',
  user_preferences: []
};
const message = (
  role: ConversationMessage['role'], content: string, parts: ConversationMessage['parts'] = []
): ConversationMessage => ({
  content, created_at: '', message_id: `${role}-${content.length}`, parts, role, source_links: []
});
const checkpoint = message('assistant', '', [{ memory, type: 'memory' }]);

describe('conversation usage estimate', () => {
  it('counts Chinese text at the provider rate instead of a quarter of it', () => {
    // 1000 ideographs are roughly 1500 tokens; chars / 4 would report 250 and never warn.
    const usage = analyzeConversationLength([message('user', '中'.repeat(1_000))], profile);
    expect(usage.estimatedTokens).toBe(1_500);
    expect(usage.modelKiloTokens).toBe(128);
    expect(usage.nearingAutoCompaction).toBe(false);
  });

  it('marks the automatic compaction point at 90% of the window', () => {
    const usage = analyzeConversationLength([message('user', '中'.repeat(80_000))], profile);
    expect(usage.usageRatio).toBeGreaterThan(0.9);
    expect(usage.nearingAutoCompaction).toBe(true);
    expect(usage.isLong).toBe(true);
  });

  it('measures only what the next request sends, from the newest checkpoint on', () => {
    const history = [message('user', '中'.repeat(80_000)), message('user', 'Keep going'), checkpoint];
    expect(conversationContextWindow(history)).toEqual([checkpoint]);
    const usage = analyzeConversationLength(history, profile);
    expect(usage.memoryActive).toBe(true);
    expect(usage.nearingAutoCompaction).toBe(false);
    expect(usage.isLong).toBe(false);
    // The whole conversation is still reported, so the history itself is never hidden.
    expect(usage.messageCount).toBe(3);
  });
});
