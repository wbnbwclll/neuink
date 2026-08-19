import type { ScopeSnapshot } from '@/shared/ipc/assistantApi';

// 把 ScopeSnapshot（用户显式选中的条目/标签）渲染成给模型看的只读上下文文本。
// 主助手 qna 与研究管线共用：研究管线用它在研究块里给模型交代可选证据范围。
export function buildScopeContext(scope: ScopeSnapshot) {
  const entries = scope.entry_ids
    .map((entryId, index) => {
      const title = scope.entry_titles[index] ?? entryId;
      return `- ${title} (${entryId})`;
    })
    .slice(0, 30);

  return [
    scope.tag_names.length > 0 ? `Tags: ${scope.tag_names.join(' / ')}` : '',
    entries.length > 0 ? `Entries:\n${entries.join('\n')}` : 'Entries: all parsed entries'
  ]
    .filter(Boolean)
    .join('\n');
}
