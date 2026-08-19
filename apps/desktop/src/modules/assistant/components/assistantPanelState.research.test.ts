import { describe, expect, it } from 'vitest';

import type { ConversationMessage } from '@/shared/ipc/assistantApi';
import type { ResearchOutline } from '@/shared/types/research';

import {
  latestResearchOutlineFromHistory,
  latestResearchRunFromHistory
} from './assistantPanelState';

const outline: ResearchOutline = {
  depth: 'standard',
  items: [{ overview: '历史背景', title: '背景' }],
  mode: 'report',
  topic: '图神经网络'
};

function message(
  role: ConversationMessage['role'],
  content: string,
  parts: ConversationMessage['parts']
): ConversationMessage {
  return {
    content,
    created_at: new Date().toISOString(),
    message_id: `${role}-${content.length}`,
    parts,
    role,
    source_links: []
  };
}

const roundOneMessage = message('assistant', '好的，请确认大纲', [
  {
    run: {
      id: 'research-123',
      nodes: [
        {
          id: 'research-123-plan',
          inputSummary: 'goal=图神经网络',
          kind: 'planner',
          outputSummary: 'outline=1 subtopics',
          startedAt: new Date().toISOString(),
          status: 'succeeded',
          title: 'Plan deep-research outline'
        }
      ],
      resumeFromNodeId: 'research-123-plan',
      startedAt: new Date().toISOString(),
      status: 'succeeded',
      subagentTaskCount: 0,
      verifierErrors: 0,
      verifierWarnings: 0
    },
    type: 'agent-run'
  },
  { outline, type: 'research-outline' }
]);

describe('research history helpers', () => {
  it('recovers the latest research outline from history', () => {
    const history = [message('user', '研究图神经网络', []), roundOneMessage];
    expect(latestResearchOutlineFromHistory(history)).toEqual(outline);
  });

  it('returns null when no research outline exists', () => {
    expect(latestResearchOutlineFromHistory([message('user', 'hi', [])])).toBeNull();
  });

  it('picks the most recent outline across rounds', () => {
    const newerOutline: ResearchOutline = {
      ...outline,
      items: [...outline.items, { title: '应用' }]
    };
    const history = [roundOneMessage, message('assistant', 'revised', [{ outline: newerOutline, type: 'research-outline' }])];
    expect(latestResearchOutlineFromHistory(history)?.items).toHaveLength(2);
  });

  it('recovers the resume run id and node from the outline message', () => {
    const history = [message('user', '研究图神经网络', []), roundOneMessage];
    expect(latestResearchRunFromHistory(history)).toEqual({
      resumeFromNodeId: 'research-123-plan',
      runId: 'research-123'
    });
  });

  it('returns null when the outline message has no agent-run part', () => {
    const history = [message('assistant', 'plan', [{ outline, type: 'research-outline' }])];
    expect(latestResearchRunFromHistory(history)).toBeNull();
  });
});
