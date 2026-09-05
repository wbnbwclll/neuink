import {
  ExternalLink,
  FolderOpen,
  FolderPlus,
  Loader2,
  MoveRight,
  X
} from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  persistAutoParseOnPdfImport,
  readAutoParseOnPdfImport
} from '@/shared/lib/parserSettings';

import type { SettingsPanelLayoutProps } from './SettingsPanelLayout';

export function DataSettingsSection({ props }: { props: SettingsPanelLayoutProps }) {
  const {
    customParserApiKey,
    customParserEndpoint,
    effectiveParserEndpointLabel,
    onCreateWorkspace,
    onMigrateWorkspace,
    onOpenCurrentWorkspace,
    onOpenRecentWorkspace,
    onForgetRecentWorkspace,
    onOpenWorkspace,
    onParserApiKeyChange,
    onParserEndpointChange,
    onResetWorkspaceRoot,
    onTranslationAutomationChange,
    workspaceBusy,
    workspaceCurrentLabel,
    workspaceDefaultLabel,
    workspaceRoot,
    workspaceSettings,
    translationAutomation
  } = props;
  const settingsContentClassName =
    'm-0 min-h-0 overflow-auto bg-background px-5 py-4';
  const settingsContentInnerClassName = (className: string) =>
    cn('settings-panel-content-inner', className);

  return (
            <TabsContent forceMount value="data" className={settingsContentClassName}>
              <div className={settingsContentInnerClassName('grid gap-5')}>
                <div className="grid gap-4 rounded-lg border bg-card p-4">
                  <div>
                    <h3 className="text-sm font-semibold">MinerU 解析方式</h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      系统支持自定义 MinerU 服务和 MinerU 客户端 ZIP 两种方式。
                    </p>
                  </div>

                  <div className="grid gap-3">
                    <div>
                      <h4 className="text-sm font-medium">方案一：自定义 MinerU 服务</h4>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        配置服务 URL 和可选 API Key，上传 PDF 后由服务完成解析。API Key 会通过
                        <code> X-API-Key</code> 请求头发送。
                      </p>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="parser-endpoint">MinerU URL</Label>
                      <Input
                        id="parser-endpoint"
                        placeholder="http://127.0.0.1:18000"
                        value={customParserEndpoint}
                        onChange={(event) => onParserEndpointChange(event.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="parser-api-key">服务 API Key</Label>
                      <Input
                        id="parser-api-key"
                        placeholder="可选"
                        type="password"
                        value={customParserApiKey}
                        onChange={(event) => onParserApiKeyChange(event.target.value)}
                      />
                    </div>
                    <AutoParseOnImportSetting />
                    <div className="border-l-2 border-border pl-3 text-xs leading-5 text-muted-foreground">
                      <p>服务可以返回 MinerU 兼容 JSON，也可以直接返回解析结果 ZIP。</p>
                      <p className="mt-1">ZIP 响应必须满足：</p>
                      <ul className="mt-1 list-disc space-y-1 pl-4">
                        <li>HTTP 状态为 2xx。</li>
                        <li>
                          Content-Type 为 <code>application/zip</code> 或 <code>application/octet-stream</code>。
                        </li>
                        <li>
                          包含 <code>*_content_list_v2.json</code> 或 <code>content_list_v2.json</code>；也兼容
                          <code> *_content_list.json</code> 或 <code>content_list.json</code>。
                        </li>
                        <li>
                          <code>*_middle.json</code> 和 <code>images/</code> 可选；内容引用图片时应包含对应图片文件。
                        </li>
                      </ul>
                    </div>
                    <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs leading-5 text-muted-foreground">
                      当前解析请求地址：
                      <span className="ml-1 font-mono text-[11px]">
                        {effectiveParserEndpointLabel}
                      </span>
                    </div>
                  </div>

                  <div className="grid gap-2 border-t pt-4">
                    <h4 className="text-sm font-medium">方案二：导入 MinerU 客户端 ZIP</h4>
                    <p className="text-xs leading-5 text-muted-foreground">
                      无需配置 URL 或 API Key。ZIP 必须包含 <code>images/</code> 文件夹，以及上述任一种
                      <code> content_list</code> JSON。使用 ZIP 直接创建新条目时，还必须包含
                      <code> *_origin.pdf</code> 或其他 PDF 文件；向已有 PDF 条目导入时不需要重复包含 PDF。
                    </p>
                  </div>
                </div>
    
                <div className="grid gap-4 rounded-lg border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">PDF 自动翻译</h3>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        PDF 解析成功后自动启动英译中。可选择默认参与翻译的内容类型；关闭时不会调用翻译模型。
                      </p>
                    </div>
                    <Switch
                      checked={translationAutomation.auto_translate_pdf}
                      onCheckedChange={(autoTranslatePdf) => onTranslationAutomationChange({
                        ...translationAutomation,
                        auto_translate_pdf: autoTranslatePdf
                      })}
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {TRANSLATION_TYPES.map((item) => {
                      const selected = translationAutomation.segment_types.includes(item.value);
                      return (
                        <Button
                          aria-pressed={selected}
                          key={item.value}
                          size="xs"
                          type="button"
                          variant={selected ? 'secondary' : 'outline'}
                          onClick={() => onTranslationAutomationChange({
                            ...translationAutomation,
                            segment_types: selected
                              ? translationAutomation.segment_types.filter((value) => value !== item.value)
                              : [...translationAutomation.segment_types, item.value]
                          })}
                        >
                          {item.label}
                        </Button>
                      );
                    })}
                  </div>
                  {!translationAutomation.segment_types.length ? (
                    <p className="text-xs text-warning">请至少选择一种内容类型，否则解析后不会启动翻译任务。</p>
                  ) : null}
                </div>

                <div className="grid gap-4 rounded-lg border bg-card p-4">
                  <div>
                    <h3 className="text-sm font-semibold">工作区</h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      打开已有工作区不会复制文件；新建和迁移是独立操作。
                    </p>
                  </div>

                  <div className="grid gap-2 rounded-md border bg-muted/20 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <Label>当前工作区</Label>
                      <Button disabled={workspaceBusy || !workspaceCurrentLabel} size="sm" type="button" variant="ghost" onClick={onOpenCurrentWorkspace}>
                        <ExternalLink />
                        在资源管理器中显示
                      </Button>
                    </div>
                    <div className="break-all text-xs leading-5 text-muted-foreground">
                      {workspaceCurrentLabel || '未打开'}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button disabled={workspaceBusy} size="sm" type="button" onClick={onOpenWorkspace}>
                      {workspaceBusy ? <Loader2 className="animate-spin" /> : <FolderOpen />}
                      打开其他工作区
                    </Button>
                    <Button disabled={workspaceBusy} size="sm" type="button" variant="outline" onClick={onCreateWorkspace}>
                      <FolderPlus />
                      新建工作区
                    </Button>
                    <Button
                      disabled={workspaceBusy || !workspaceSettings?.custom_root}
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={onResetWorkspaceRoot}
                    >
                      打开默认工作区
                    </Button>
                  </div>

                  {(workspaceSettings?.recent_workspaces ?? []).filter(
                    (item) => item.root !== (workspaceRoot ?? workspaceSettings?.root ?? '')
                  ).length ? (
                    <div className="grid gap-2">
                      <Label>最近使用</Label>
                      <div className="grid gap-1">
                        {(workspaceSettings?.recent_workspaces ?? [])
                          .filter((item) => item.root !== (workspaceRoot ?? workspaceSettings?.root ?? ''))
                          .slice(0, 5)
                          .map((item) => (
                            <div key={item.root} className="flex min-w-0 items-center gap-1 rounded-md hover:bg-muted">
                              <button
                                className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-xs"
                                disabled={workspaceBusy}
                                type="button"
                                onClick={() => onOpenRecentWorkspace(item.root)}
                              >
                                <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                                <span className="truncate">{item.root}</span>
                              </button>
                              <Button
                                aria-label={`从最近使用中移除 ${item.root}`}
                                disabled={workspaceBusy}
                                size="icon-sm"
                                type="button"
                                variant="ghost"
                                onClick={() => onForgetRecentWorkspace(item.root)}
                              >
                                <X />
                              </Button>
                            </div>
                          ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="border-t pt-3">
                    <Button disabled={workspaceBusy} size="sm" type="button" variant="ghost" onClick={onMigrateWorkspace}>
                      <MoveRight />
                      迁移当前工作区…
                    </Button>
                    <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                      复制全部资料到空目录，验证后切换；原目录不会自动删除。默认位置：{workspaceDefaultLabel || '读取中'}
                    </p>
                  </div>
                </div>
    
              </div>
            </TabsContent>
  );
}

function AutoParseOnImportSetting() {
  const [enabled, setEnabled] = useState(readAutoParseOnPdfImport);
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border bg-muted/20 px-3 py-2.5">
      <div className="min-w-0">
        <Label className="text-sm">上传 PDF 后自动开始解析</Label>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
          关闭后只将 PDF 保存到本地文库；可在 PDF 阅读页手动开始解析。
        </p>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={(checked) => {
          setEnabled(checked);
          persistAutoParseOnPdfImport(checked);
        }}
      />
    </div>
  );
}

const TRANSLATION_TYPES = [
  { value: 'paragraph', label: '段落' },
  { value: 'heading', label: '标题' },
  { value: 'table', label: '表格' },
  { value: 'math', label: '公式' },
  { value: 'figure', label: '图片' },
  { value: 'code', label: '代码' },
  { value: 'list', label: '列表' },
  { value: 'page_header', label: '页眉' },
  { value: 'page_footer', label: '页脚' },
  { value: 'page_number', label: '页码' },
  { value: 'aside_text', label: '侧栏文字' },
  { value: 'page_footnote', label: '脚注' }
] as const;
