import { describe, expect, it } from 'vitest';

import {
  DEFAULT_AGENT_RUNTIME_SETTINGS,
  normalizeAgentRuntimeSettings,
  selectAgentExecution
} from './agentRuntimeSettings';

describe('research assistant runtime settings', () => {
  it('defaults to a research_assistant singleton next to the main assistant', () => {
    const settings = DEFAULT_AGENT_RUNTIME_SETTINGS;
    expect(settings.researchAssistant.kind).toBe('research_assistant');
    expect(settings.researchAssistant.id).toBe('research-assistant');
    expect(settings.researchAssistant.name).toBeTruthy();
    expect(settings.researchAssistant.sandbox).toBe('read-only');
    expect(settings.researchAssistant.permissions.canWriteProposals).toBe(false);
    expect(settings.researchAssistant.research.depth).toBe('standard');
  });

  it('fills in a research assistant when legacy settings lack the key', () => {
    const legacy = {
      ...DEFAULT_AGENT_RUNTIME_SETTINGS,
      researchAssistant: undefined
    } as unknown as Parameters<typeof normalizeAgentRuntimeSettings>[0];
    const normalized = normalizeAgentRuntimeSettings(legacy);
    expect(normalized.researchAssistant.kind).toBe('research_assistant');
    expect(normalized.researchAssistant.id).toBe('research-assistant');
  });

  it('selects the research assistant when preferredAgentId matches its id', () => {
    const settings = DEFAULT_AGENT_RUNTIME_SETTINGS;
    const selection = selectAgentExecution(
      settings,
      '整理一份关于扩散模型的综述',
      null,
      settings.researchAssistant.id
    );
    expect(selection.agent.kind).toBe('research_assistant');
    expect(selection.agent.id).toBe(settings.researchAssistant.id);
  });

  it('falls back to the main assistant when preferredAgentId is null', () => {
    const selection = selectAgentExecution(DEFAULT_AGENT_RUNTIME_SETTINGS, '帮我看看这篇论文');
    expect(selection.agent.kind).toBe('main_assistant');
  });
});
