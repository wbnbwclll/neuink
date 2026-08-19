import { Check, Loader2, Plus, Trash2 } from 'lucide-react';
import { memo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type {
  ResearchOutline,
  ResearchOutlineItem
} from '@/shared/types/research';

type ResearchOutlineCardProps = {
  disabled?: boolean;
  onStartResearch: (outline: ResearchOutline) => void;
  outline: ResearchOutline;
};

function ResearchOutlineCardComponent({
  disabled = false,
  onStartResearch,
  outline
}: ResearchOutlineCardProps) {
  const [topic, setTopic] = useState(outline.topic);
  const [items, setItems] = useState<ResearchOutlineItem[]>(outline.items);

  const updateItem = (index: number, patch: Partial<ResearchOutlineItem>) => {
    setItems((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
    );
  };

  const removeItem = (index: number) => {
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const addItem = () => {
    setItems((current) => [
      ...current,
      { title: '', overview: `新增子主题 ${current.length + 1}` }
    ]);
  };

  const buildOutline = (): ResearchOutline => ({
    topic: topic.trim() || outline.topic,
    items: items
      .map((item) => ({
        title: item.title.trim(),
        overview: item.overview?.trim() || undefined
      }))
      .filter((item) => Boolean(item.title)),
    mode: outline.mode,
    depth: outline.depth
  });

  const canStart = !disabled && topic.trim().length > 0 && items.length > 0;

  return (
    <div className="mt-2 min-w-0 rounded-md border bg-muted/15 p-2 text-xs leading-5">
      <div className="mb-1.5 flex min-w-0 items-center gap-1.5">
        <span className="shrink-0 rounded-sm border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {depthLabel(outline.depth)}
        </span>
        <span className="shrink-0 rounded-sm border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {modeLabel(outline.mode)}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">
          研究大纲
        </span>
      </div>

      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
        主题
      </label>
      <Input
        className="mb-2 h-7 text-xs"
        disabled={disabled}
        value={topic}
        onChange={(event) => setTopic(event.target.value)}
      />

      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted-foreground">
          子主题（{items.length}）
        </span>
        <Button
          className="h-6 px-1.5 text-[11px]"
          disabled={disabled}
          size="xs"
          type="button"
          variant="ghost"
          onClick={addItem}
        >
          <Plus size={11} aria-hidden="true" />
          添加
        </Button>
      </div>
      <div className="grid gap-1.5">
        {items.map((item, index) => (
          <div
            className="min-w-0 rounded-sm border bg-background p-1.5"
            key={`${outline.topic}-${index}`}
          >
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {index + 1}.
              </span>
              <Input
                aria-label={`子主题 ${index + 1} 标题`}
                className="h-6 flex-1 text-xs"
                disabled={disabled}
                value={item.title}
                onChange={(event) => updateItem(index, { title: event.target.value })}
              />
              <Button
                aria-label={`删除子主题 ${index + 1}`}
                className="h-6 w-6 shrink-0 px-0 text-[11px]"
                disabled={disabled}
                size="xs"
                type="button"
                variant="ghost"
                onClick={() => removeItem(index)}
              >
                <Trash2 size={11} aria-hidden="true" />
              </Button>
            </div>
            <Textarea
              aria-label={`子主题 ${index + 1} 概述`}
              className="mt-1 min-h-0 resize-none text-[11px] leading-4"
              disabled={disabled}
              placeholder="概述（可选）"
              rows={2}
              value={item.overview ?? ''}
              onChange={(event) => updateItem(index, { overview: event.target.value })}
            />
          </div>
        ))}
      </div>

      <div className="mt-2 flex justify-end gap-1">
        <Button
          className="h-7 px-2 text-[11px]"
          disabled={!canStart}
          size="xs"
          type="button"
          onClick={() => onStartResearch(buildOutline())}
        >
          {disabled ? <Loader2 className="animate-spin" size={11} aria-hidden="true" /> : <Check size={11} aria-hidden="true" />}
          开始研究
        </Button>
      </div>
    </div>
  );
}

export const ResearchOutlineCard = memo(ResearchOutlineCardComponent);

export function depthLabel(depth: ResearchOutline['depth']) {
  if (depth === 'quick') {
    return '快速';
  }
  if (depth === 'standard') {
    return '标准';
  }
  if (depth === 'deep') {
    return '深度';
  }
  return '手动';
}

export function modeLabel(mode: ResearchOutline['mode']) {
  if (mode === 'report') {
    return '研究报告';
  }
  if (mode === 'notes') {
    return '笔记';
  }
  if (mode === 'comparison') {
    return '对比';
  }
  return '学习路径';
}
