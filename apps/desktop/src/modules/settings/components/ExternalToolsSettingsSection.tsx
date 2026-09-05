import { TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { SciverseSettingsSection } from '@/modules/sciverse/components/SciverseSettingsSection';

import { AgentToolRuntimeSection } from './AgentSettingsSection';
import type { SettingsPanelLayoutProps } from './SettingsPanelLayout';

export function ExternalToolsSettingsSection({
  props
}: {
  props: SettingsPanelLayoutProps;
}) {
  const active = props.activeSettingsTab === 'external-tools';

  return (
    <TabsContent
      forceMount
      value="external-tools"
      className="m-0 min-h-0 overflow-auto bg-background px-5 py-4"
    >
      <div className={cn('settings-panel-content-inner', 'grid gap-4')}>
        <div>
          <h2 className="text-base font-semibold">外部工具与 MCP</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            统一管理外部检索服务和 Agent 可调用的 MCP 工具入口。凭据保存在系统凭据库中。
          </p>
        </div>

        <SciverseSettingsSection active={active} />
        <AgentToolRuntimeSection
          runtimeSettings={props.runtimeSettings}
          onUpdateRuntimeSettings={props.onUpdateRuntimeSettings}
        />
      </div>
    </TabsContent>
  );
}
