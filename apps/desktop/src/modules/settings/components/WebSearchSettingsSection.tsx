import {
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  PlugZap,
  Save,
  Trash2
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useToast } from '@/shared/hooks/useToast';

import {
  getWebSearchSettings,
  revealTavilyApiToken,
  saveWebSearchSettings,
  testWebSearchProvider
} from '@/modules/settings/api/webSearchApi';
import type {
  WebSearchProviderKey,
  WebSearchSettingsState
} from '@/modules/settings/api/webSearchTypes';

const MASKED_TOKEN = '••••••••••••••••';

const PROVIDERS: Array<{
  key: WebSearchProviderKey;
  label: string;
  description: string;
  needsKey: boolean;
}> = [
  { key: 'duckduckgo', label: 'DuckDuckGo', description: '免密钥 · 通用网页搜索', needsKey: false },
  { key: 'arxiv', label: 'arXiv', description: '免密钥 · 学术预印本', needsKey: false },
  { key: 'tavily', label: 'Tavily', description: '需 API Key · AI 检索', needsKey: true }
];

type BusyAction =
  | 'clear'
  | 'load'
  | 'reveal'
  | 'save'
  | 'test'
  | 'toggle'
  | 'providers'
  | null;

export function WebSearchSettingsSection({ active }: { active: boolean }) {
  const { notify } = useToast();
  const [settings, setSettings] = useState<WebSearchSettingsState | null>(null);
  const [tokenDraft, setTokenDraft] = useState('');
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [editingToken, setEditingToken] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, string | null>>({});
  const [testElapsed, setTestElapsed] = useState<number>(0);

  useEffect(() => {
    if (!active || loaded) return undefined;

    let cancelled = false;
    setBusy('load');
    setLoadError(null);
    void getWebSearchSettings()
      .then((next) => {
        if (cancelled) return;
        applySettings(next);
        setLoaded(true);
      })
      .catch((caught) => {
        if (!cancelled) setLoadError(errorMessage(caught));
      })
      .finally(() => {
        if (!cancelled) setBusy(null);
      });
    return () => {
      cancelled = true;
    };
  }, [active, loadAttempt]);

  const applySettings = (next: WebSearchSettingsState) => {
    setSettings(next);
    setTokenDraft('');
    setRevealedToken(null);
    setEditingToken(false);
    setShowToken(false);
    setConfirmingClear(false);
  };

  const notifyFailure = (title: string, caught: unknown) => {
    notify({ tone: 'danger', title, description: errorMessage(caught) });
  };

  const pending = busy !== null;
  const hasToken = Boolean(settings?.tavily.has_api_key);
  const environmentManaged = settings?.tavily.token_source === 'environment';
  const tavilySelected = settings?.providers.includes('tavily') ?? false;
  const editingTokenValue = editingToken || !hasToken;
  const displayedToken = editingTokenValue
    ? tokenDraft
    : hasToken
      ? revealedToken ?? MASKED_TOKEN
      : '';

  const toggleEnabled = async (enabled: boolean) => {
    if (!settings) return;
    setBusy('toggle');
    setTestResults({});
    try {
      const next = await saveWebSearchSettings({ enabled });
      applySettings(next);
      notify({ tone: 'success', title: enabled ? '网络检索与网页读取已启用' : '已停用' });
    } catch (caught) {
      notifyFailure(enabled ? '启用失败' : '停用失败', caught);
    } finally {
      setBusy(null);
    }
  };

  const changeProviders = async (providers: WebSearchProviderKey[]) => {
    if (!settings) return;
    if (providers.length === 0) {
      notify({ tone: 'danger', title: '请至少选择一个搜索服务' });
      return;
    }
    setBusy('providers');
    setTestResults({});
    try {
      const next = await saveWebSearchSettings({ providers });
      applySettings(next);
      notify({ tone: 'success', title: '搜索服务已更新' });
    } catch (caught) {
      notifyFailure('保存搜索服务失败', caught);
    } finally {
      setBusy(null);
    }
  };

  const saveToken = async () => {
    const token = tokenDraft.trim();
    if (!token) {
      notify({ tone: 'danger', title: '请输入 Tavily API Key' });
      return;
    }
    if (settings?.tavily.token_source === 'environment') {
      notify({
        tone: 'danger',
        title: 'API Key 由环境变量管理',
        description: '请修改启动 Neuink 时使用的 TAVILY_API_TOKEN。'
      });
      return;
    }

    setBusy('save');
    try {
      const next = await saveWebSearchSettings({ tavilyApiKey: token });
      if (!next.tavily.has_api_key || next.tavily.token_source !== 'credential_store') {
        throw new Error('系统凭据库未能回读刚保存的 Tavily API Key，请重试。');
      }
      applySettings(next);
      notify({
        tone: 'success',
        title: hasToken ? 'Tavily API Key 已替换' : 'Tavily API Key 已保存'
      });
    } catch (caught) {
      notifyFailure('保存 Tavily API Key 失败', caught);
    } finally {
      setBusy(null);
    }
  };

  const clearCredential = async () => {
    if (!settings) return;
    // 与 Sciverse 一致：清除密钥会同时取消 Tavily 选择并停用 Web 检索，保证状态一致。
    const remainingProviders = settings.providers.filter((provider) => provider !== 'tavily');
    setBusy('clear');
    try {
      const next = await saveWebSearchSettings({
        clearTavilyApiKey: true,
        enabled: remainingProviders.length === 0 ? false : undefined,
        providers: remainingProviders.length > 0 ? remainingProviders : undefined
      });
      applySettings(next);
      notify({ tone: 'success', title: 'Tavily API Key 已清除' });
    } catch (caught) {
      notifyFailure('清除 Tavily API Key 失败', caught);
    } finally {
      setBusy(null);
    }
  };

  const toggleTokenVisibility = async () => {
    if (showToken) {
      setShowToken(false);
      return;
    }
    if (editingToken || !hasToken) {
      if (tokenDraft) setShowToken(true);
      return;
    }
    if (revealedToken) {
      setShowToken(true);
      return;
    }

    setBusy('reveal');
    try {
      const token = await revealTavilyApiToken();
      setRevealedToken(token);
      setShowToken(true);
    } catch (caught) {
      notifyFailure('读取 Tavily API Key 失败', caught);
    } finally {
      setBusy(null);
    }
  };

  const copyVisibleToken = async () => {
    const token = editingToken || !hasToken ? tokenDraft : revealedToken;
    if (!showToken || !token) return;
    try {
      await navigator.clipboard.writeText(token);
      notify({ tone: 'success', title: 'Tavily API Key 已复制' });
    } catch (caught) {
      notifyFailure('复制 Tavily API Key 失败', caught);
    }
  };

  const test = async () => {
    if (!settings || settings.providers.length === 0) return;
    setBusy('test');
    setTestResults({});
    const nextResults: Record<string, string | null> = {};
    const started = Date.now();
    for (const provider of settings.providers) {
      nextResults[provider] = null;
      setTestResults({ ...nextResults });
      try {
        const status = await testWebSearchProvider(provider);
        nextResults[provider] = `连接正常，返回 ${status.result_count} 条结果`;
      } catch (caught) {
        nextResults[provider] = `连接失败：${errorMessage(caught)}`;
      }
      setTestResults({ ...nextResults });
    }
    setTestElapsed(Math.round((Date.now() - started) / 1000));
    setBusy(null);
    notify({
      tone: 'default',
      title: '搜索服务检测完成',
      description: `已测试 ${settings.providers.length} 个服务`
    });
  };

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-4 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-md border bg-muted/35 text-primary">
            <PlugZap size={17} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">网络检索与网页读取</h3>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                  settings?.enabled
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : 'text-muted-foreground'
                }`}
              >
                {settings?.enabled ? '已启用' : '已停用'}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              为助手提供网页搜索（web_search）与正文抓取（read_web_page）。
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">允许助手调用</span>
          <Switch
            aria-label="允许助手调用网络检索与网页读取"
            checked={settings?.enabled ?? false}
            disabled={pending || !settings}
            onCheckedChange={(checked) => void toggleEnabled(checked)}
          />
        </div>
      </div>

      <div className="grid gap-4 border-t bg-background/55 p-4">
        {busy === 'load' ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="animate-spin" size={14} />
            正在读取配置…
          </div>
        ) : loadError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs">
            <div className="font-medium text-destructive">读取配置失败</div>
            <div className="mt-1 break-words text-muted-foreground">{loadError}</div>
            <Button
              className="mt-3"
              size="sm"
              type="button"
              variant="outline"
              onClick={() => {
                setLoaded(false);
                setLoadError(null);
                setLoadAttempt((current) => current + 1);
              }}
            >
              重新读取
            </Button>
          </div>
        ) : settings ? (
          <>
            <div className="grid gap-2">
              <label className="text-xs font-medium">搜索服务（可多选，结果合并去重）</label>
              <ToggleGroup
                className="flex-wrap"
                disabled={pending || !settings.enabled}
                size="sm"
                type="multiple"
                value={settings.providers}
                onValueChange={(value) => void changeProviders(value as WebSearchProviderKey[])}
              >
                {PROVIDERS.map((provider) => (
                  <ToggleGroupItem key={provider.key} value={provider.key} title={provider.description}>
                    {provider.label}
                    {provider.needsKey ? <span className="text-[10px] opacity-60">Key</span> : null}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p className="text-[11px] leading-5 text-muted-foreground">
                所有启用工具会合并去重后按顺序返回给助手。
                {!settings.enabled ? ' 启用上方开关后即可选择服务。' : ''}
              </p>
            </div>

            {settings.providers.length > 0 ? (
              <div className="flex items-center gap-2">
                <Button
                  aria-label="测试当前启用的搜索服务"
                  disabled={pending}
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => void test()}
                >
                  {busy === 'test' ? <Loader2 className="animate-spin" /> : <PlugZap size={14} />}
                  测试连接
                </Button>
                {busy === 'test' ? (
                  <span className="text-xs text-muted-foreground">正在测试各服务…</span>
                ) : Object.keys(testResults).length > 0 ? (
                  <span className="text-[11px] text-muted-foreground">用时 {testElapsed}s</span>
                ) : null}
              </div>
            ) : null}

            {Object.keys(testResults).length > 0 ? (
              <div className="grid gap-1">
                {Object.entries(testResults).map(([provider, message]) => {
                  const ok = message?.startsWith('连接正常');
                  return (
                    <div
                      key={provider}
                      className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs ${
                        ok
                          ? 'border-emerald-500/25 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400'
                          : 'border-destructive/30 bg-destructive/5'
                      }`}
                    >
                      {ok ? (
                        <CheckCircle2 size={14} aria-hidden="true" />
                      ) : message ? (
                        <span className="text-destructive">✕</span>
                      ) : (
                        <Loader2 className="animate-spin" size={14} />
                      )}
                      <span className="capitalize">{provider}</span>
                      <span className="flex-1 break-words">{message}</span>
                    </div>
                  );
                })}
              </div>
            ) : null}

            <div className="grid gap-2">
              <label className="text-xs font-medium" htmlFor="web-search-tavily-key">
                Tavily API Key
                <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                  （选 Tavily 时需要）
                </span>
              </label>
              <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center">
                <div className="relative min-w-0 flex-1">
                  <KeyRound
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    size={15}
                  />
                  <Input
                    id="web-search-tavily-key"
                    aria-label="Tavily API Key"
                    className="h-9 pl-9 pr-16 font-mono text-xs"
                    disabled={pending}
                    placeholder={
                      environmentManaged
                        ? '由环境变量管理'
                        : hasToken
                          ? 'API Key 已保存'
                          : tavilySelected
                            ? '已选择 Tavily，请填写 API Key'
                            : '输入 Tavily API Key'
                    }
                    readOnly={environmentManaged || (hasToken && !editingToken)}
                    type={showToken ? 'text' : 'password'}
                    value={displayedToken}
                    onChange={(event) => {
                      setTokenDraft(event.target.value);
                    }}
                  />
                  <button
                    aria-label="复制当前显示的 API Key"
                    className="absolute right-8 top-1/2 grid size-7 -translate-y-1/2 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-40"
                    disabled={pending || !showToken || !(editingTokenValue ? tokenDraft : revealedToken)}
                    title="复制当前显示的 API Key"
                    type="button"
                    onClick={() => void copyVisibleToken()}
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    aria-label={showToken ? '隐藏 API Key' : '显示 API Key'}
                    className="absolute right-1 top-1/2 grid size-7 -translate-y-1/2 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-40"
                    disabled={pending || (!hasToken && !tokenDraft)}
                    title={showToken ? '隐藏 API Key' : '显示 API Key'}
                    type="button"
                    onClick={() => void toggleTokenVisibility()}
                  >
                    {busy === 'reveal' ? (
                      <Loader2 className="animate-spin" size={15} />
                    ) : showToken ? (
                      <EyeOff size={15} />
                    ) : (
                      <Eye size={15} />
                    )}
                  </button>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {hasToken && !environmentManaged && !editingToken ? (
                    <Button
                      disabled={pending}
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setEditingToken(true);
                        setTokenDraft('');
                        setRevealedToken(null);
                        setShowToken(false);
                      }}
                    >
                      <KeyRound />
                      替换 Key
                    </Button>
                  ) : !environmentManaged ? (
                    <>
                      <Button
                        disabled={pending || !tokenDraft.trim()}
                        size="sm"
                        type="button"
                        onClick={() => void saveToken()}
                      >
                        {busy === 'save' ? <Loader2 className="animate-spin" /> : <Save />}
                        {hasToken ? '保存新 Key' : '保存 Key'}
                      </Button>
                      {hasToken && editingToken ? (
                        <Button
                          disabled={pending}
                          size="sm"
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            setEditingToken(false);
                            setTokenDraft('');
                            setRevealedToken(null);
                            setShowToken(false);
                          }}
                        >
                          取消
                        </Button>
                      ) : null}
                    </>
                  ) : null}
                  {settings.tavily.token_source === 'credential_store' ? (
                    <Button
                      aria-label="清除 Tavily API Key"
                      disabled={pending}
                      size="sm"
                      type="button"
                      variant="ghost"
                      onClick={() => setConfirmingClear(true)}
                    >
                      <Trash2 />
                      清除
                    </Button>
                  ) : null}
                </div>
              </div>
              <p className="text-[11px] leading-5 text-muted-foreground">
                {environmentManaged
                  ? '由 TAVILY_API_TOKEN 环境变量管理。'
                  : hasToken
                    ? '已保存在系统凭据库。'
                    : tavilySelected
                      ? '使用 Tavily 前需要保存 API Key。'
                      : '密钥保存在系统凭据库，不落盘到设置文件。'}
              </p>
            </div>

            {confirmingClear ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <div className="text-xs">
                  <div className="font-medium text-destructive">确认清除系统凭据库中的 Tavily API Key？</div>
                  <div className="mt-1 text-muted-foreground">
                    清除后会同时取消 Tavily 选择，若无剩余服务则停用 Web 检索。
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" type="button" variant="ghost" onClick={() => setConfirmingClear(false)}>
                    取消
                  </Button>
                  <Button size="sm" type="button" variant="destructive" onClick={() => void clearCredential()}>
                    确认清除
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}

function errorMessage(caught: unknown) {
  return caught instanceof Error ? caught.message : String(caught);
}