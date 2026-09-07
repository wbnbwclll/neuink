import {
  Bot,
  FolderOpen,
  PackagePlus,
  PlugZap,
  Plus,
  ShieldCheck,
  Trash2,
  Workflow,
  Wrench
} from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  createBlankSkillPackage,
  listSkillPackageCategories,
  subagentOutputLabel
} from '@/shared/lib/agentRuntimeSettings';
import type {
  AgentProfile,
  AgentMcpServer,
  AgentRuntimeSettings,
  SkillPackage,
  SubagentProfile
} from '@/shared/types/agentRuntime';

export type AgentSettingsView = 'main-agent' | 'subagents' | 'skills';

const REQUIRED_SUBAGENT_IDS = new Set(['task-orchestrator-agent']);
const SYSTEM_SUBAGENT_IDS = new Set([
  'task-orchestrator-agent',
  'memory-agent'
]);

type AgentSettingsSectionProps = {
  llmProfiles: { id: string; model: string; name: string }[];
  onAddAgent: () => void;
  onAddSkillPackage: () => void;
  onImportSkillPackage: () => void;
  onOpenSkillPackageFolder: (skillPackage: SkillPackage) => void;
  onRemoveAgent: (agentId: string) => void;
  onRemoveSkillPackage: (skillPackageId: string) => void;
  onSelectAgent: (agentId: string) => void;
  onSelectSkillPackage: (skillPackageId: string) => void;
  onUpdateAgent: (nextAgent: AgentProfile) => void;
  onUpdateRuntimeSettings: (nextSettings: AgentRuntimeSettings) => void;
  onUpdateSkillPackage: (nextSkillPackage: SkillPackage) => void;
  runtimeSettings: AgentRuntimeSettings;
  selectedAgentId: string | null;
  selectedSkillPackageId: string | null;
  view: AgentSettingsView;
};

export function AgentSettingsSection({
  llmProfiles,
  onImportSkillPackage,
  onOpenSkillPackageFolder,
  onRemoveSkillPackage,
  onSelectAgent,
  onSelectSkillPackage,
  onUpdateAgent,
  onUpdateRuntimeSettings,
  onUpdateSkillPackage,
  runtimeSettings,
  selectedAgentId,
  selectedSkillPackageId,
  view
}: AgentSettingsSectionProps) {
  const selectedSubagent =
    runtimeSettings.subagents.find((agent) => agent.id === selectedAgentId) ??
    runtimeSettings.subagents[0] ??
    null;
  const selectedSkillPackage =
    runtimeSettings.skillPackages.find((skillPackage) => skillPackage.id === selectedSkillPackageId) ??
    runtimeSettings.skillPackages[0] ??
    createBlankSkillPackage(0);
  const [skillEditorOpen, setSkillEditorOpen] = useState(false);
  const enabledSkills = runtimeSettings.skillPackages.filter((skillPackage) => skillPackage.enabled);
  const systemSubagents = runtimeSettings.subagents.filter((agent) => SYSTEM_SUBAGENT_IDS.has(agent.id));
  const workerSubagents = runtimeSettings.subagents.filter((agent) => !SYSTEM_SUBAGENT_IDS.has(agent.id));

  if (view === 'main-agent') {
    return (
      <div className="grid gap-4">
        <AgentSettingsHeader
          description="主 Agent 是唯一直接与用户对话的执行者。它先接收任务合同，再决定直接回答、调用工具或委派专项子 Agent。"
          title="主 Agent"
        />

        <div className="grid items-start gap-4 xl:grid-cols-2">
        <EditorPanel description="只配置身份、模型和职责。运行权限在右侧单独管理。" title="身份与模型">
          <AgentCommonFields
            agent={runtimeSettings.mainAssistant}
            llmProfiles={llmProfiles}
            roleLabel="全局主助手"
            showSystemPrompt={false}
            onUpdate={onUpdateAgent}
          />
        </EditorPanel>

        <EditorPanel description="这些开关决定主 Agent 在执行阶段能做什么。" title="执行权限">
          <div className="grid gap-3 md:grid-cols-2">
            <SwitchRow
              checked={runtimeSettings.mainAssistant.permissions.canInvokeSubagents}
              label="允许委派子 Agent"
              onCheckedChange={(checked) =>
                onUpdateAgent({
                  ...runtimeSettings.mainAssistant,
                  permissions: {
                    ...runtimeSettings.mainAssistant.permissions,
                    canInvokeSubagents: checked
                  }
                })
              }
            />
            <SwitchRow
              checked={runtimeSettings.mainAssistant.permissions.canInvokeTools}
              description="关闭后只能进行不依赖外部观察的回答。"
              label="允许调用工具"
              onCheckedChange={(checked) =>
                onUpdateAgent({
                  ...runtimeSettings.mainAssistant,
                  permissions: {
                    ...runtimeSettings.mainAssistant.permissions,
                    canInvokeTools: checked
                  }
                })
              }
            />
            <SwitchRow
              checked={runtimeSettings.mainAssistant.permissions.canUseSkills}
              description="Skill 由编排模型根据语义选择，不按关键词硬匹配。"
              label="允许加载 Skills"
              onCheckedChange={(checked) =>
                onUpdateAgent({
                  ...runtimeSettings.mainAssistant,
                  permissions: {
                    ...runtimeSettings.mainAssistant.permissions,
                    canUseSkills: checked
                  }
                })
              }
            />
            <SwitchRow
              checked={runtimeSettings.mainAssistant.permissions.canWriteProposals}
              label="允许生成写入提案"
              onCheckedChange={(checked) =>
                onUpdateAgent({
                  ...runtimeSettings.mainAssistant,
                  permissions: {
                    ...runtimeSettings.mainAssistant.permissions,
                    canWriteProposals: checked
                  }
                })
              }
            />
          </div>
          <AssignmentSelector
            description="系统子 Agent 会自动参与固定阶段；这里只控制主 Agent 可以按需委派的任务型 worker。"
            emptyText="当前没有任务型子 Agent。"
            items={workerSubagents.map((agent) => ({
              description: agent.description,
              disabled: !agent.enabled,
              id: agent.id,
              label: agent.name
            }))}
            label="可委派的任务型子 Agent"
            selectedIds={runtimeSettings.mainAssistant.allowedSubagentIds}
            onToggle={(agentId) =>
              onUpdateRuntimeSettings({
                ...runtimeSettings,
                mainAssistant: {
                  ...runtimeSettings.mainAssistant,
                  allowedSubagentIds: toggleId(
                    runtimeSettings.mainAssistant.allowedSubagentIds,
                    agentId
                  )
                }
              })
            }
          />
        </EditorPanel>
        </div>

        <details className="group rounded-lg border bg-card">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold">
            <Wrench className="text-muted-foreground" size={14} />
            高级设置
            <span className="ml-auto text-xs font-normal text-muted-foreground">系统提示词与 MCP 授权</span>
          </summary>
          <div className="grid gap-4 border-t p-4">
            <Field label="主 Agent 系统提示词">
              <Textarea
                className="min-h-36 font-mono text-xs leading-5"
                value={runtimeSettings.mainAssistant.systemPrompt}
                onChange={(event) => onUpdateAgent({
                  ...runtimeSettings.mainAssistant,
                  systemPrompt: event.target.value
                })}
              />
            </Field>
          <McpServerSelector
            agent={runtimeSettings.mainAssistant}
            runtimeSettings={runtimeSettings}
            onUpdate={onUpdateAgent}
          />
          </div>
        </details>
      </div>
    );
  }

  if (view === 'subagents') {
    return (
      <div className="grid gap-4">
        <AgentSettingsHeader
          description="子 Agent 不直接接管对话。系统型 Agent 负责任务编排与记忆；任务型 Agent 只执行主 Agent 委派的专项工作。Skill 选择已经并入任务编排阶段。"
          title="子 Agent"
        />

        <div className="grid items-start gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
          <SettingsCollectionCard icon={Workflow} title={`内置子 Agent · ${runtimeSettings.subagents.length}`}>
            <CollectionGroupLabel>系统流程</CollectionGroupLabel>
            {systemSubagents.map((agent) => (
              <SelectableRow
                key={agent.id}
                active={selectedSubagent?.id === agent.id}
                label={agent.name}
                meta={`${agent.enabled ? '启用' : '停用'} · ${subagentPurposeLabel(agent)}`}
                onClick={() => onSelectAgent(agent.id)}
              />
            ))}
            <CollectionGroupLabel>任务执行</CollectionGroupLabel>
            {workerSubagents.map((agent) => (
              <SelectableRow
                key={agent.id}
                active={selectedSubagent?.id === agent.id}
                label={agent.name}
                meta={`${agent.enabled ? '启用' : '停用'} · ${subagentPurposeLabel(agent)}`}
                onClick={() => onSelectAgent(agent.id)}
              />
            ))}
          </SettingsCollectionCard>

          {selectedSubagent ? (
            <EditorPanel
              description="配置该 worker 的模型、提示词、权限和可用 Skills。"
              title={selectedSubagent.name}
            >
              <SubagentEditor
                agent={selectedSubagent}
                llmProfiles={llmProfiles}
                runtimeSettings={runtimeSettings}
                assignedToMain={runtimeSettings.mainAssistant.allowedSubagentIds.includes(selectedSubagent.id)}
                required={REQUIRED_SUBAGENT_IDS.has(selectedSubagent.id)}
                onAssignmentChange={(assigned) =>
                  onUpdateRuntimeSettings({
                    ...runtimeSettings,
                    mainAssistant: {
                      ...runtimeSettings.mainAssistant,
                      allowedSubagentIds: assigned
                        ? [...new Set([...runtimeSettings.mainAssistant.allowedSubagentIds, selectedSubagent.id])]
                        : runtimeSettings.mainAssistant.allowedSubagentIds.filter((id) => id !== selectedSubagent.id)
                    }
                  })
                }
                onUpdate={onUpdateAgent}
              />
            </EditorPanel>
          ) : (
            <EditorPanel description="当前没有可配置的子 Agent。" title="子 Agent">
              <div className="text-xs text-muted-foreground">暂无子 Agent。</div>
            </EditorPanel>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <AgentSettingsHeader
        action={(
          <Button size="sm" type="button" variant="outline" onClick={onImportSkillPackage}>
            <PackagePlus />
            导入 Skill
          </Button>
        )}
        description={`Skill 是按需加载的说明与资源包，不会自行运行。已安装 ${runtimeSettings.skillPackages.length} 个，已启用 ${enabledSkills.length} 个，由 TaskOrchestratorAgent 根据任务语义选择。`}
        title="Skills 技能库"
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {runtimeSettings.skillPackages.length === 0 ? (
          <div className="col-span-full rounded-xl border border-dashed bg-muted/20 p-6 text-center text-xs leading-5 text-muted-foreground">
            尚未安装 Skill。导入包含 SKILL.md 的标准技能包后，编排模型才会看到它的能力说明。
          </div>
        ) : null}
        {runtimeSettings.skillPackages.map((skillPackage) => {
          const active = selectedSkillPackage.id === skillPackage.id;
          return (
            <Card key={skillPackage.id} size="sm" className={active ? 'border-primary bg-primary/[0.04]' : 'hover:border-primary/45'}>
              <CardHeader>
                <CardTitle className="truncate">{skillPackage.name}</CardTitle>
                <CardAction className="flex items-center gap-2">
                  <Badge variant={skillPackage.enabled ? 'default' : 'outline'}>{skillPackage.enabled ? '启用' : '停用'}</Badge>
                  <Switch
                    aria-label={`切换 ${skillPackage.name} 的启用状态`}
                    checked={skillPackage.enabled}
                    onClick={(event) => event.stopPropagation()}
                    onCheckedChange={(enabled) => onUpdateSkillPackage({ ...skillPackage, enabled })}
                  />
                </CardAction>
              </CardHeader>
              <CardContent>
                <button
                  className="grid w-full gap-3 text-left"
                  type="button"
                  onClick={() => {
                    onSelectSkillPackage(skillPackage.id);
                    setSkillEditorOpen(true);
                  }}
                >
                  <p className="line-clamp-2 min-h-10 text-xs leading-5 text-muted-foreground">{skillPackage.description || '尚未添加说明。'}</p>
                  <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                    <span>{skillCategoryLabel(skillPackage.category)}</span>
                    <span>·</span>
                    <span>{skillPackage.kind === 'builtin' ? '内置' : '已安装'}</span>
                    <span>·</span>
                    <span>{skillPackage.triggers.length > 0 ? `${skillPackage.triggers.length} 条适用场景` : '未描述适用场景'}</span>
                  </div>
                </button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={skillEditorOpen} onOpenChange={setSkillEditorOpen}>
        <DialogContent className="grid h-[min(760px,calc(100vh-3rem))] w-[min(860px,calc(100vw-2rem))] max-w-none grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0 sm:max-w-none">
          <DialogHeader className="border-b px-6 py-5">
            <DialogTitle>{selectedSkillPackage.name || 'Skill'}</DialogTitle>
            <DialogDescription>编辑技能行为、查看指令与资源。所有写入由应用服务控制。</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto px-6 py-5">
            <EditorPanel description="配置触发条件；指令内容与资源均保持独立查看。" title="技能配置" onRemove={() => onRemoveSkillPackage(selectedSkillPackage.id)}>
              <SkillPackageEditor skillPackage={selectedSkillPackage} onOpenFolder={() => onOpenSkillPackageFolder(selectedSkillPackage)} onUpdate={onUpdateSkillPackage} />
            </EditorPanel>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AgentSettingsHeader({
  action,
  description,
  title
}: {
  action?: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

function AssignmentSelector({ description, emptyText, items, label, onToggle, selectedIds }: {
  description: string;
  emptyText: string;
  items: Array<{ description: string; disabled?: boolean; id: string; label: string }>;
  label: string;
  onToggle: (id: string) => void;
  selectedIds: string[];
}) {
  return (
    <div className="grid gap-2">
      <div>
        <Label>{label}</Label>
        <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-2 rounded-lg border border-border/70 bg-background p-2">
        {items.length === 0 ? <div className="px-1 py-2 text-xs text-muted-foreground">{emptyText}</div> : null}
        {items.map((item) => (
          <label className={`flex items-center gap-3 rounded-md border border-border/60 px-3 py-2 ${item.disabled ? 'opacity-55' : ''}`} key={item.id}>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{item.label}</span>
              <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{item.description}</span>
            </span>
            <Switch checked={!item.disabled && selectedIds.includes(item.id)} disabled={item.disabled} onCheckedChange={() => onToggle(item.id)} />
          </label>
        ))}
      </div>
    </div>
  );
}

function CollectionGroupLabel({ children }: { children: ReactNode }) {
  return <div className="px-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{children}</div>;
}

function subagentPurposeLabel(agent: SubagentProfile) {
  if (agent.outputKind === 'task_contract') return '任务理解与执行合同';
  if (agent.outputKind === 'memory') return '对话语义记忆';
  if (agent.outputKind === 'patch_plan') return '笔记局部修改规划';
  return '证据检索与整理';
}

function subagentExecutionDescription(agent: SubagentProfile) {
  if (agent.outputKind === 'task_contract') return '每次提问首先运行，理解自然语言、当前上下文和历史延续关系，生成后续执行合同。';
  if (agent.outputKind === 'memory') return '在回合完成后压缩稳定目标、决定和未完成事项；它不替代原始对话记录。';
  if (agent.outputKind === 'patch_plan') return '仅在需要修改现有 Markdown 笔记时生成局部 patch 方案，最终仍需用户确认。';
  return '仅在需要跨文献检索和阅读证据时接受委派，并返回带来源的证据摘要。';
}

function skillCategoryLabel(category: SkillPackage['category']) {
  const labels: Record<SkillPackage['category'], string> = {
    automation: '自动化', custom: '自定义', reading: '阅读', report: '报告', research: '研究', slides: '演示文稿', writing: '写作'
  };
  return labels[category];
}

function AgentCommonFields({
  agent,
  llmProfiles,
  onUpdate,
  roleLabel,
  showSystemPrompt = true
}: {
  agent: AgentProfile;
  llmProfiles: { id: string; model: string; name: string }[];
  onUpdate: (nextAgent: AgentProfile) => void;
  roleLabel: string;
  showSystemPrompt?: boolean;
}) {
  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="名称">
          <Input value={agent.name} onChange={(event) => onUpdate({ ...agent, name: event.target.value })} />
        </Field>
        <ReadOnlyValue label="角色" value={roleLabel} />
      </div>

      <Field label="使用的大模型配置">
        <Select
          value={agent.llmProfileId ?? '__assistant_default__'}
          onValueChange={(value) =>
            onUpdate({
              ...agent,
              llmProfileId: value === '__assistant_default__' ? null : value
            })
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__assistant_default__">跟随对话任务模型</SelectItem>
            {llmProfiles.map((profile) => (
              <SelectItem key={profile.id} value={profile.id}>
                {profile.name} · {profile.model}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="说明">
        <Input
          value={agent.description}
          onChange={(event) => onUpdate({ ...agent, description: event.target.value })}
        />
      </Field>

      {showSystemPrompt ? <Field label="系统提示词">
        <Textarea
          className="min-h-28"
          value={agent.systemPrompt}
          onChange={(event) => onUpdate({ ...agent, systemPrompt: event.target.value })}
        />
      </Field> : null}
    </>
  );
}

function SubagentEditor({
  agent,
  assignedToMain,
  llmProfiles,
  onAssignmentChange,
  onUpdate,
  required,
  runtimeSettings
}: {
  agent: SubagentProfile;
  assignedToMain: boolean;
  llmProfiles: { id: string; model: string; name: string }[];
  onAssignmentChange: (assigned: boolean) => void;
  onUpdate: (nextAgent: AgentProfile) => void;
  required: boolean;
  runtimeSettings: AgentRuntimeSettings;
}) {
  const systemAgent = SYSTEM_SUBAGENT_IDS.has(agent.id);
  return (
    <>
      <div className="grid gap-2 rounded-lg border border-primary/15 bg-primary/[0.035] px-3 py-2 text-xs leading-5 text-muted-foreground">
        <div className="font-medium text-foreground">{subagentPurposeLabel(agent)}</div>
        <div>{subagentExecutionDescription(agent)}</div>
      </div>
      <AgentCommonFields
        agent={agent}
        llmProfiles={llmProfiles}
        roleLabel={`子 Agent · ${subagentOutputLabel(agent.outputKind)}`}
        showSystemPrompt={false}
        onUpdate={onUpdate}
      />
      <ReadOnlyValue
        label="SUBAGENT manifest"
        value={agent.subagentManifestPath ?? 'agent-runtime/subagents/<id>/SUBAGENT.toml'}
      />

      <div className="grid gap-3 md:grid-cols-2">
        <SwitchRow
          checked={agent.enabled}
          description={required ? '任务编排依赖此 Agent，不能停用。' : '停用后不会参与后续任务。'}
          disabled={required}
          label={required ? '启用此子 Agent（必需）' : '启用此子 Agent'}
          onCheckedChange={(checked) => onUpdate({ ...agent, enabled: checked })}
        />
        {systemAgent ? (
          <SwitchRow
            checked={agent.enabled}
            description={required ? '固定必需阶段，无需手动委派。' : '启用后自动参与对应系统阶段，不进入任务委派列表。'}
            disabled
            label="系统流程自动调用"
            onCheckedChange={() => undefined}
          />
        ) : (
          <SwitchRow
            checked={assignedToMain}
            description="允许主 Agent 在需要时把专项任务交给它。"
            label="允许主 Agent 委派"
            onCheckedChange={onAssignmentChange}
          />
        )}
      </div>

      {!systemAgent && agent.permissions.canUseSkills ? <TagSelector
        label="允许加载的 Skills"
        options={runtimeSettings.skillPackages.map((skillPackage) => ({
          id: skillPackage.id,
          label: skillPackage.name
        }))}
        selectedIds={agent.allowedSkillPackageIds}
        onToggle={(skillPackageId) =>
          onUpdate({
            ...agent,
            allowedSkillPackageIds: toggleId(agent.allowedSkillPackageIds, skillPackageId)
          })
        }
      /> : null}

      <details className="group rounded-lg border border-border/70 bg-background">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium">
          <ShieldCheck className="text-muted-foreground" size={14} />
          高级权限与提示词
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            {systemAgent ? '系统型 Agent 默认不调用工具' : '最小权限原则'}
          </span>
        </summary>
        <div className="grid gap-3 border-t p-3">
          {!systemAgent ? <div className="grid gap-3 md:grid-cols-2">
            <SwitchRow
              checked={agent.permissions.canInvokeTools}
              label="允许调用工具"
              onCheckedChange={(checked) => onUpdate({
                ...agent,
                permissions: { ...agent.permissions, canInvokeTools: checked }
              })}
            />
            <SwitchRow
              checked={agent.permissions.canReadWorkspaceWide}
              label="允许读取全局 Workspace"
              onCheckedChange={(checked) => onUpdate({
                ...agent,
                permissions: { ...agent.permissions, canReadWorkspaceWide: checked }
              })}
            />
            <SwitchRow
              checked={agent.permissions.canUseSkills}
              label="允许加载 Skills"
              onCheckedChange={(checked) => onUpdate({
                ...agent,
                permissions: { ...agent.permissions, canUseSkills: checked }
              })}
            />
            <SwitchRow
              checked={agent.permissions.canWriteProposals}
              label="允许生成写入提案"
              onCheckedChange={(checked) => onUpdate({
                ...agent,
                permissions: { ...agent.permissions, canWriteProposals: checked }
              })}
            />
          </div> : (
            <div className="rounded-md border border-dashed px-3 py-2 text-xs leading-5 text-muted-foreground">
              该 Agent 只消费调用方提供的结构化上下文并返回结构化结果，不应读取 Workspace、调用工具或产生写入提案。
            </div>
          )}
          <Field label="系统提示词">
            <Textarea
              className="min-h-36 font-mono text-xs leading-5"
              value={agent.systemPrompt}
              onChange={(event) => onUpdate({ ...agent, systemPrompt: event.target.value })}
            />
          </Field>
          {!systemAgent && agent.permissions.canInvokeTools ? (
            <McpServerSelector agent={agent} runtimeSettings={runtimeSettings} onUpdate={onUpdate} />
          ) : null}
        </div>
      </details>
    </>
  );
}

function SkillPackageEditor({
  onOpenFolder,
  onUpdate,
  skillPackage
}: {
  onOpenFolder: () => void;
  onUpdate: (nextSkillPackage: SkillPackage) => void;
  skillPackage: SkillPackage;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <Badge variant={skillPackage.enabled ? 'default' : 'outline'}>
          {skillPackage.enabled ? '已启用' : '已停用'}
        </Badge>
        <span>{skillPackage.kind === 'builtin' ? '内置技能' : '已安装技能'}</span>
        <span>·</span>
        <span>{skillPackage.category}</span>
        <span>·</span>
        <span>v{skillPackage.version}</span>
      </div>

      <Tabs className="gap-4" defaultValue="behavior">
        <TabsList variant="line">
          <TabsTrigger value="behavior">行为</TabsTrigger>
          <TabsTrigger value="instructions">指令</TabsTrigger>
          <TabsTrigger value="resources">资源与来源</TabsTrigger>
        </TabsList>

        <TabsContent value="behavior">
          <div className="grid gap-4 pt-1">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="名称">
                <Input
                  value={skillPackage.name}
                  onChange={(event) => onUpdate({ ...skillPackage, name: event.target.value })}
                />
              </Field>
              <Field label="分类">
                <Select
                  value={skillPackage.category}
                  onValueChange={(value) =>
                    onUpdate({ ...skillPackage, category: value as SkillPackage['category'] })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {listSkillPackageCategories().map((category) => (
                      <SelectItem key={category} value={category}>{category}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <SwitchRow
              checked={skillPackage.enabled}
              label="启用此技能包"
              onCheckedChange={(checked) => onUpdate({ ...skillPackage, enabled: checked })}
            />
            <Field label="说明">
              <Input value={skillPackage.description} onChange={(event) => onUpdate({ ...skillPackage, description: event.target.value })} />
            </Field>
            <Field label="适用场景提示">
              <Input
                placeholder="用逗号分隔，例如：整理研究笔记, 生成阅读摘要"
                value={skillPackage.triggers.join(', ')}
                onChange={(event) => onUpdate({
                  ...skillPackage,
                  triggers: event.target.value.split(',').map((item) => item.trim()).filter(Boolean)
                })}
              />
            </Field>
            <div className="rounded-lg border border-border/70 bg-background p-3 text-xs text-muted-foreground">
              <div className="font-medium text-foreground">选择方式</div>
              <p className="mt-1 leading-5">这些短语只是提供给编排模型的语义线索，不执行固定关键词匹配。选中后才会加载 SKILL.md；Skill 本身不能绕过应用服务写入数据。</p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="instructions">
          <div className="grid gap-3 pt-1">
            <div className="text-xs leading-5 text-muted-foreground">内置或已安装包的指令保持只读；如需修改完整 SKILL.md，请在本地文件夹中编辑后重新载入。</div>
            <Textarea className="h-[min(48vh,36rem)] resize-y font-mono text-xs leading-5" readOnly value={skillPackage.readme} />
            <Button disabled={!skillPackage.packagePath && !skillPackage.skillMarkdownPath} size="sm" type="button" variant="outline" onClick={onOpenFolder}>
              <FolderOpen /> 打开本地文件夹
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="resources">
          <div className="grid gap-3 pt-1">
            <div className="grid gap-2 rounded-lg border border-border/70 bg-background px-3 py-2 text-xs text-muted-foreground">
              <div>来源：{skillPackage.sourceArchivePath ?? '内置或手动创建'}</div>
              <div>安装路径：{skillPackage.packagePath ?? '尚未解包'}</div>
              <div>SKILL.md：{skillPackage.skillMarkdownPath ?? '内置内容'}</div>
              <div>脚本执行：{skillPackage.scriptExecution ?? 'disabled'}（必须通过 MCP 或 Tool Package 授权）</div>
            </div>
            <ResourceList title="references/" paths={skillPackage.resourcePaths?.references ?? []} />
            <ResourceList title="scripts/" paths={skillPackage.resourcePaths?.scripts ?? []} />
            <ResourceList title="assets/" paths={skillPackage.resourcePaths?.assets ?? []} />
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}

function McpServerSelector({
  agent,
  onUpdate,
  runtimeSettings
}: {
  agent: AgentProfile;
  onUpdate: (nextAgent: AgentProfile) => void;
  runtimeSettings: AgentRuntimeSettings;
}) {
  return (
    <TagSelector
      label="允许使用的 MCP 服务"
      options={runtimeSettings.mcpServers.map((server) => ({
        id: server.id,
        label: `${server.name}${server.enabled ? '' : ' (disabled)'}`
      }))}
      selectedIds={agent.allowedMcpServerIds ?? []}
      onToggle={(serverId) =>
        onUpdate({
          ...agent,
          allowedMcpServerIds: toggleId(agent.allowedMcpServerIds ?? [], serverId)
        })
      }
    />
  );
}

export function AgentToolRuntimeSection({
  onUpdateRuntimeSettings,
  runtimeSettings
}: {
  onUpdateRuntimeSettings: (nextSettings: AgentRuntimeSettings) => void;
  runtimeSettings: AgentRuntimeSettings;
}) {
  const addMcpServer = () => {
    const nextIndex = runtimeSettings.mcpServers.length + 1;
    const nextServer: AgentMcpServer = {
      allowedToolNames: [],
      command: '',
      description: '',
      enabled: true,
      id: `mcp-server-${nextIndex}`,
      name: `MCP Server ${nextIndex}`
    };
    onUpdateRuntimeSettings({
      ...runtimeSettings,
      mcpServers: [...runtimeSettings.mcpServers, nextServer],
      toolPackages: [
        ...runtimeSettings.toolPackages,
        {
          allowedToolIds: [],
          description: 'Tools exposed through this MCP server. Skill scripts are not executable unless exposed here.',
          enabled: true,
          id: `mcp-tool-package-${nextIndex}`,
          kind: 'mcp',
          mcpServerId: nextServer.id,
          name: `${nextServer.name} tools`,
          permissionMode: 'ask'
        }
      ]
    });
  };

  const updateMcpServer = (serverId: string, patch: Partial<AgentMcpServer>) => {
    onUpdateRuntimeSettings({
      ...runtimeSettings,
      mcpServers: runtimeSettings.mcpServers.map((server) =>
        server.id === serverId ? { ...server, ...patch } : server
      )
    });
  };

  const removeMcpServer = (serverId: string) => {
    onUpdateRuntimeSettings({
      ...runtimeSettings,
      mainAssistant: {
        ...runtimeSettings.mainAssistant,
        allowedMcpServerIds: (runtimeSettings.mainAssistant.allowedMcpServerIds ?? []).filter(
          (id) => id !== serverId
        )
      },
      mcpServers: runtimeSettings.mcpServers.filter((server) => server.id !== serverId),
      subagents: runtimeSettings.subagents.map((agent) => ({
        ...agent,
        allowedMcpServerIds: (agent.allowedMcpServerIds ?? []).filter((id) => id !== serverId)
      })),
      toolPackages: runtimeSettings.toolPackages.filter(
        (toolPackage) => toolPackage.mcpServerId !== serverId
      )
    });
  };

  return (
    <div className="grid gap-3 rounded-lg border border-border/70 bg-background p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <PlugZap className="shrink-0 text-muted-foreground" size={14} />
          <div className="min-w-0">
            <div className="text-sm font-semibold">MCP 与工具入口</div>
            <div className="text-xs text-muted-foreground">
              注册可执行工具入口。Skill 中的脚本只有通过 MCP 或受控工具包暴露后才能执行。
            </div>
          </div>
        </div>
        <Button size="xs" type="button" variant="outline" onClick={addMcpServer}>
          <Plus />
          添加 MCP
        </Button>
      </div>
      {runtimeSettings.mcpServers.length === 0 ? (
        <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          尚未配置 MCP 服务。
        </div>
      ) : (
        <div className="grid gap-2">
          {runtimeSettings.mcpServers.map((server) => (
            <div key={server.id} className="grid gap-2 rounded-md border border-border/70 p-3">
              <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto]">
                <Input
                  value={server.name}
                  onChange={(event) => updateMcpServer(server.id, { name: event.target.value })}
                />
                <Input
                  placeholder="启动命令，例如 npx @modelcontextprotocol/server-filesystem"
                  value={server.command}
                  onChange={(event) => updateMcpServer(server.id, { command: event.target.value })}
                />
                <Button
                  size="icon-sm"
                  title="移除 MCP 服务"
                  type="button"
                  variant="ghost"
                  onClick={() => removeMcpServer(server.id)}
                >
                  <Trash2 />
                </Button>
              </div>
              <Input
                placeholder="允许的工具名称，用逗号分隔"
                value={server.allowedToolNames.join(', ')}
                onChange={(event) =>
                  updateMcpServer(server.id, {
                    allowedToolNames: event.target.value
                      .split(',')
                      .map((item) => item.trim())
                      .filter(Boolean)
                  })
                }
              />
              <SwitchRow
                checked={server.enabled}
                label="启用此 MCP 服务"
                onCheckedChange={(checked) => updateMcpServer(server.id, { enabled: checked })}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsCollectionCard({
  actionLabel,
  children,
  extraAction,
  icon: Icon,
  onAction,
  title
}: {
  actionLabel?: string;
  children: ReactNode;
  extraAction?: ReactNode;
  icon: typeof Bot;
  onAction?: () => void;
  title: string;
}) {
  return (
    <div className="grid gap-3 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-muted p-1.5 text-muted-foreground">
            <Icon size={14} />
          </span>
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        {actionLabel || extraAction ? (
          <div className="flex gap-1">
            {extraAction}
            {actionLabel && onAction ? (
              <Button size="xs" type="button" variant="outline" onClick={onAction}>
                <Plus />
                {actionLabel}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="grid gap-2">{children}</div>
    </div>
  );
}

function EditorPanel({
  children,
  description,
  onRemove,
  title
}: {
  children: ReactNode;
  description: string;
  onRemove?: () => void;
  title: string;
}) {
  return (
    <div className="grid gap-4 rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
        {onRemove ? (
          <Button size="xs" type="button" variant="ghost" onClick={onRemove}>
            <Trash2 />
            删除
          </Button>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function SelectableRow({
  active,
  label,
  meta,
  onClick
}: {
  active: boolean;
  label: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`rounded-lg border px-3 py-2 text-left transition ${
        active
          ? 'border-primary/35 bg-primary/6 shadow-sm'
          : 'border-border/70 bg-background hover:border-primary/20 hover:bg-muted/25'
      }`}
      type="button"
      onClick={onClick}
    >
      <div className="text-sm font-semibold">{label}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{meta}</div>
    </button>
  );
}

function ReadOnlyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
        {value}
      </div>
    </div>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function SwitchRow({
  checked,
  description,
  disabled = false,
  label,
  onCheckedChange
}: {
  checked: boolean;
  description?: string;
  disabled?: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className={`flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background px-3 py-2 ${disabled ? 'opacity-60' : ''}`}>
      <span className="min-w-0">
        <span className="block text-sm">{label}</span>
        {description ? <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{description}</span> : null}
      </span>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </label>
  );
}

function TagSelector({
  label,
  onToggle,
  options,
  selectedIds
}: {
  label: string;
  onToggle: (id: string) => void;
  options: Array<{ id: string; label: string }>;
  selectedIds: string[];
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2 rounded-lg border border-border/70 bg-background p-3">
        {options.length === 0 ? (
          <span className="text-xs text-muted-foreground">暂无可选项</span>
        ) : null}
        {options.map((option) => {
          const active = selectedIds.includes(option.id);
          return (
            <button
              key={option.id}
              className="text-left"
              type="button"
              onClick={() => onToggle(option.id)}
            >
              <Badge variant={active ? 'default' : 'outline'}>{option.label}</Badge>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ResourceList({ paths, title }: { paths: string[]; title: string }) {
  return (
    <div className="grid gap-2 rounded-lg border border-border/70 bg-background p-3">
      <div className="text-xs font-semibold">{title}</div>
      {paths.length === 0 ? (
        <div className="text-xs text-muted-foreground">暂无文件</div>
      ) : (
        <div className="grid max-h-36 gap-1 overflow-auto">
          {paths.map((path) => (
            <div
              key={path}
              className="truncate rounded border border-border/50 bg-muted/20 px-2 py-1 font-mono text-[11px] text-muted-foreground"
              title={path}
            >
              {path}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function toggleId(ids: string[], id: string) {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}
