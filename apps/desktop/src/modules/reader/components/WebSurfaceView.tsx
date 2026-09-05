import { ExternalLink, RefreshCw } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import type { WorkspaceSurface } from '@/app/workspaceSurface';
import { EntryContentHeader } from './EntryContentHeader';

/**
 * 网页来源标签页：在内容区用 iframe 加载外部 URL，并提供「刷新」与「在系统浏览器打开」按钮。
 * iframe 不带 allow-top-navigation，防止被嵌页面导航掉整个应用；
 * 跨源页面受浏览器同源策略隔离，读不到 Neuink 的应用数据。
 */
export function WebSurfaceView({
  onOpenExternal,
  surface
}: {
  onOpenExternal: (url: string) => void;
  surface: Extract<WorkspaceSurface, { kind: 'web' }>;
}) {
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <div className="grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
      <EntryContentHeader contentTitle={surface.title || '网页'} entryTitle={surface.url}>
        <Button
          className="h-6 px-2 text-[11px]"
          size="xs"
          title="刷新"
          type="button"
          variant="outline"
          onClick={() => setReloadKey((current) => current + 1)}
        >
          <RefreshCw size={12} aria-hidden="true" />
          刷新
        </Button>
        <Button
          className="h-6 px-2 text-[11px]"
          size="xs"
          title="在系统默认浏览器中打开"
          type="button"
          variant="outline"
          onClick={() => onOpenExternal(surface.url)}
        >
          <ExternalLink size={12} aria-hidden="true" />
          在浏览器打开
        </Button>
      </EntryContentHeader>
      <div className="min-h-0 min-w-0 flex-1 bg-white">
        <iframe
          className="size-full border-0"
          key={reloadKey}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          src={surface.url}
          title={surface.title || surface.url}
        />
      </div>
    </div>
  );
}