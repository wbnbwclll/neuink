import { describe, expect, it } from 'vitest';

import type { TagMeta } from '@/shared/types/domain';

import { buildTagTree, collectDescendantTagIds } from './tagTree';

const tags: TagMeta[] = [
  { id: 'research', name: '研究', parent_id: null, created_at: '', updated_at: '' },
  { id: 'hci', name: 'HCI', parent_id: 'research', created_at: '', updated_at: '' },
  { id: 'ai', name: 'AI', parent_id: 'research', created_at: '', updated_at: '' },
  { id: 'reading', name: '待读', parent_id: null, created_at: '', updated_at: '' }
];

describe('tagTree', () => {
  it('counts an entry once in a parent folder when it has multiple descendant tags', () => {
    const tree = buildTagTree(tags, [
      { tagIds: ['hci', 'ai'] },
      { tagIds: ['hci'] },
      { tagIds: ['reading'] }
    ]);

    const research = tree.find((node) => node.id === 'research');
    expect(research?.count).toBe(2);
    expect(research?.children.find((node) => node.id === 'hci')?.count).toBe(2);
    expect(research?.children.find((node) => node.id === 'ai')?.count).toBe(1);
  });

  it('collects the selected virtual folder and all descendant folders', () => {
    expect([...collectDescendantTagIds(tags, 'research')].sort()).toEqual(['ai', 'hci', 'research']);
  });
});
