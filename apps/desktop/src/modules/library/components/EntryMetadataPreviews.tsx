import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';

const DESCRIPTION_PREVIEW_LENGTH = 240;
const VISIBLE_TAG_LIMIT = 10;
const VISIBLE_FIELD_LIMIT = 2;

export function CompactEntryDescription({ description }: { description: string }) {
  const normalized = description.trim();
  const truncated = normalized.length > DESCRIPTION_PREVIEW_LENGTH;
  const preview = truncated ? `${normalized.slice(0, DESCRIPTION_PREVIEW_LENGTH).trimEnd()}...` : normalized;

  return (
    <div className="grid h-[5.75rem] min-w-0 grid-rows-[minmax(0,1fr)_auto] text-xs leading-5">
      <p className="line-clamp-3 whitespace-pre-wrap break-words">{preview}</p>
      {truncated ? (
        <HoverCard openDelay={120} closeDelay={100}>
          <HoverCardTrigger asChild>
            <button className="text-left text-[11px] text-primary hover:underline" type="button">
              还有 {normalized.length - DESCRIPTION_PREVIEW_LENGTH} 字未显示
            </button>
          </HoverCardTrigger>
          <HoverCardContent align="start" className="max-h-[min(24rem,60vh)] w-[min(34rem,calc(100vw-2rem))] overflow-y-auto whitespace-pre-wrap break-words text-xs leading-5">
            {normalized}
          </HoverCardContent>
        </HoverCard>
      ) : null}
    </div>
  );
}

export function CompactEntryTags({ tags }: { tags: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? tags : tags.slice(0, VISIBLE_TAG_LIMIT);
  const hiddenCount = Math.max(0, tags.length - VISIBLE_TAG_LIMIT);

  return (
    <div className="grid min-h-12 min-w-0 grid-rows-[minmax(0,1fr)_auto]">
      <div className="flex min-w-0 flex-wrap content-start items-center gap-1 overflow-hidden">
        {visible.map((tag) => (
          <Badge className="min-w-0 max-w-full shrink truncate" key={tag} title={tag} variant="secondary">
            {tagLeaf(tag)}
          </Badge>
        ))}
      </div>
      {hiddenCount > 0 ? (
        <button
          aria-label={expanded ? '收起标签' : `展开全部 ${tags.length} 个标签`}
          className="justify-self-end rounded px-1.5 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          type="button"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? '收起' : '…'}
        </button>
      ) : <span />}
    </div>
  );
}

function tagLeaf(tag: string) {
  const parts = tag.split('/').map((part) => part.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? tag;
}

export function CompactEntryFields({ fields }: { fields: Array<[string, string]> }) {
  const visible = fields.slice(0, VISIBLE_FIELD_LIMIT);
  const hidden = fields.slice(VISIBLE_FIELD_LIMIT);

  return (
    <div className="grid h-[4.5rem] min-w-0 grid-rows-[minmax(0,1fr)_auto]">
      <div className="grid content-start gap-1 overflow-hidden">
        {visible.map(([key, value]) => (
          <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)] gap-2 text-xs" key={key}>
            <span className="truncate font-medium text-foreground" title={key}>{key}</span>
            <span className="truncate text-muted-foreground" title={value}>{value}</span>
          </div>
        ))}
      </div>
      {hidden.length > 0 ? (
        <HoverCard openDelay={120} closeDelay={100}>
          <HoverCardTrigger asChild>
            <button className="w-fit text-left text-[11px] text-primary hover:underline" type="button">
              还有 {hidden.length} 项未显示
            </button>
          </HoverCardTrigger>
          <HoverCardContent align="start" className="max-h-[min(24rem,60vh)] w-[min(34rem,calc(100vw-2rem))] overflow-y-auto">
            <dl className="grid gap-3 text-xs">
              {fields.map(([key, value]) => (
                <div className="min-w-0" key={key}>
                  <dt className="font-medium text-foreground">{key}</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap break-words text-muted-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          </HoverCardContent>
        </HoverCard>
      ) : <span />}
    </div>
  );
}
