// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_AGENT_RUNTIME_SETTINGS } from '@/shared/lib/agentRuntimeSettings';
import type { AgentRuntimeSettings } from '@/shared/types/agentRuntime';

import { AgentSettingsSection, type AgentSettingsView } from './AgentSettingsSection';

afterEach(cleanup);

describe('AgentSettingsSection information architecture', () => {
  it('shows every runtime subagent grouped by its actual responsibility', () => {
    const { getAllByText, getByText, queryByText } = renderSection('subagents');

    expect(getAllByText('TaskOrchestratorAgent')).toHaveLength(2);
    expect(getByText('MemoryAgent')).toBeTruthy();
    expect(getByText('EvidenceAgent')).toBeTruthy();
    expect(getByText('PatchPlannerAgent')).toBeTruthy();
    expect(getByText('系统流程')).toBeTruthy();
    expect(getByText('任务执行')).toBeTruthy();
    expect(queryByText('SkillSelectorAgent')).toBeNull();
  });

  it('separates the main agent identity, permissions, and worker assignments', () => {
    const { getByText, queryByLabelText } = renderSection('main-agent');

    expect(getByText('身份与模型')).toBeTruthy();
    expect(getByText('执行权限')).toBeTruthy();
    expect(getByText('可委派的任务型子 Agent')).toBeTruthy();
    expect(getByText('高级设置')).toBeTruthy();
    expect(queryByLabelText('Agent 运行链路')).toBeNull();
  });

  it('describes Skills as semantically selected packages rather than keyword routes', () => {
    const { getByText, queryByLabelText, queryByRole } = renderSection('skills');

    expect(getByText(/由 TaskOrchestratorAgent 根据任务语义选择/)).toBeTruthy();
    expect(getByText(/不会自行运行/)).toBeTruthy();
    expect(queryByRole('button', { name: '新建 Skill' })).toBeNull();
    expect(queryByLabelText('Agent 运行链路')).toBeNull();
  });
});

function renderSection(view: AgentSettingsView) {
  const runtimeSettings = JSON.parse(
    JSON.stringify(DEFAULT_AGENT_RUNTIME_SETTINGS)
  ) as AgentRuntimeSettings;
  return render(
    <AgentSettingsSection
      llmProfiles={[{ id: 'profile-1', model: 'test-model', name: '测试模型' }]}
      runtimeSettings={runtimeSettings}
      selectedAgentId={null}
      selectedSkillPackageId={null}
      view={view}
      onAddAgent={vi.fn()}
      onAddSkillPackage={vi.fn()}
      onImportSkillPackage={vi.fn()}
      onOpenSkillPackageFolder={vi.fn()}
      onRemoveAgent={vi.fn()}
      onRemoveSkillPackage={vi.fn()}
      onSelectAgent={vi.fn()}
      onSelectSkillPackage={vi.fn()}
      onUpdateAgent={vi.fn()}
      onUpdateRuntimeSettings={vi.fn()}
      onUpdateSkillPackage={vi.fn()}
    />
  );
}
