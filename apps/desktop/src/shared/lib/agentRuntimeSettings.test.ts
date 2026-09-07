import { describe, expect, it } from 'vitest';

import {
  DEFAULT_AGENT_RUNTIME_SETTINGS,
  normalizeAgentRuntimeSettings
} from './agentRuntimeSettings';

describe('normalizeAgentRuntimeSettings', () => {
  it('keeps the required task orchestrator enabled', () => {
    const settings = structuredClone(DEFAULT_AGENT_RUNTIME_SETTINGS);
    const orchestrator = settings.subagents.find(
      (agent) => agent.id === 'task-orchestrator-agent'
    );
    if (!orchestrator) throw new Error('missing task orchestrator fixture');
    orchestrator.enabled = false;

    const normalized = normalizeAgentRuntimeSettings(settings);

    expect(
      normalized.subagents.find((agent) => agent.id === 'task-orchestrator-agent')?.enabled
    ).toBe(true);
    expect(normalized.mainAssistant.allowedSubagentIds).toEqual([
      'evidence-agent',
      'patch-planner-agent'
    ]);
    expect(normalized.subagents.some((agent) => agent.id === 'skill-selector-agent')).toBe(false);
  });
});
