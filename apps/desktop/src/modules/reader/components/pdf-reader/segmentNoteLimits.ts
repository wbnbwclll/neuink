export const MAX_SEGMENT_NOTE_CHARACTERS = 500;

export type SegmentNoteValidation = {
  length: number;
  maxLength: number;
  overLimit: boolean;
};

export function getSegmentNoteValidation(visibleText: string): SegmentNoteValidation {
  const length = Array.from(visibleText.replace(/\r?\n/g, '')).length;
  return {
    length,
    maxLength: MAX_SEGMENT_NOTE_CHARACTERS,
    overLimit: length > MAX_SEGMENT_NOTE_CHARACTERS
  };
}

export function getSegmentNoteVisibleText(markdown: string): string {
  const normalized = markdown.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n').map((line) => {
    let visible = line
      .replace(/^\s{0,3}#{1,6}\s+/, '')
      .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')
      .replace(/^\s*>\s?/, '')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]*>/g, '');

    for (const marker of ['**', '__', '~~', '==', '`', '*', '_']) {
      visible = visible.split(marker).join('');
    }

    return decodeHtmlEntities(visible);
  });

  return lines.join('');
}

function decodeHtmlEntities(value: string) {
  return value.replace(
    /&(amp|lt|gt|quot|apos|#39|#x[0-9a-f]+|#[0-9]+);/gi,
    (entity) => {
      const normalized = entity.toLowerCase();
      if (normalized === '&amp;') return '&';
      if (normalized === '&lt;') return '<';
      if (normalized === '&gt;') return '>';
      if (normalized === '&quot;') return '"';
      if (normalized === '&apos;' || normalized === '&#39;') return "'";
      if (normalized.startsWith('&#x')) {
        const codePoint = Number.parseInt(normalized.slice(3, -1), 16);
        return Number.isSafeInteger(codePoint) ? String.fromCodePoint(codePoint) : entity;
      }
      if (normalized.startsWith('&#')) {
        const codePoint = Number.parseInt(normalized.slice(2, -1), 10);
        return Number.isSafeInteger(codePoint) ? String.fromCodePoint(codePoint) : entity;
      }
      return entity;
    }
  );
}
