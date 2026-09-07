import { describe, expect, it } from 'vitest';

import type { WorkspaceSurface } from './workspaceSurface';
import { resolveWorkspaceSurfacePair } from './workspaceSurfacePairing';

const surfaces: WorkspaceSurface[] = [
  { kind: 'library' },
  { kind: 'settings' },
  { kind: 'create-entry' },
  { kind: 'mineru-client-guide' },
  { kind: 'tag-editor' },
  { kind: 'entry-overview', entryId: 'a' },
  { kind: 'pdf', entryId: 'a' },
  { kind: 'reflow', entryId: 'a' },
  { kind: 'note', entryId: 'a', noteId: 'n1' },
  { kind: 'segment-notes', entryId: 'a' },
  { kind: 'source-links', entryId: 'a' },
  { kind: 'entry-trash', entryId: 'a' }
];

describe('resolveWorkspaceSurfacePair', () => {
  it('classifies every oriented surface combination symmetrically', () => {
    expect(surfaces).toHaveLength(12);
    for (const left of surfaces) {
      for (const right of surfaces) {
        const forward = resolveWorkspaceSurfacePair(left, right);
        const reverse = resolveWorkspaceSurfacePair(right, left);
        expect(forward.relation).toBe(reverse.relation);
        expect(forward.sameEntry).toBe(reverse.sameEntry);
        expect(forward.left).toBe(left);
        expect(forward.right).toBe(right);
      }
    }
  });

  it.each([
    [{ kind: 'pdf', entryId: 'a' }, { kind: 'reflow', entryId: 'a' }, 'reader-sync'],
    [{ kind: 'pdf', entryId: 'a' }, { kind: 'segment-notes', entryId: 'a' }, 'record-sync'],
    [{ kind: 'reflow', entryId: 'a' }, { kind: 'segment-notes', entryId: 'a' }, 'record-sync'],
    [{ kind: 'pdf', entryId: 'a' }, { kind: 'note', entryId: 'b', noteId: 'n1' }, 'citation'],
    [{ kind: 'source-links', entryId: 'a' }, { kind: 'note', entryId: 'b', noteId: 'n1' }, 'backlink-navigation'],
    [{ kind: 'source-links', entryId: 'a' }, { kind: 'pdf', entryId: 'a' }, 'source-navigation']
  ] as const)('classifies %j with %j as %s', (left, right, relation) => {
    expect(resolveWorkspaceSurfacePair(left, right).relation).toBe(relation);
  });

  it('does not synchronize readers from different entries', () => {
    expect(resolveWorkspaceSurfacePair(
      { kind: 'pdf', entryId: 'a' },
      { kind: 'reflow', entryId: 'b' }
    ).relation).toBe('independent');
  });
});
