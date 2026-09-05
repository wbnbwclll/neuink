// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import {
  fileToBase64,
  firstImageFromClipboard,
  imageAltFromPath
} from './useMarkdownNoteImages';

describe('Markdown note image input', () => {
  it('prefers an image file and ignores non-image clipboard files', () => {
    const textFile = new File(['notes'], 'notes.txt', { type: 'text/plain' });
    const imageFile = new File(['pixels'], 'figure.png', { type: 'image/png' });
    const clipboard = {
      files: [textFile, imageFile],
      items: []
    } as unknown as DataTransfer;

    expect(firstImageFromClipboard(clipboard)).toBe(imageFile);
    expect(firstImageFromClipboard(null)).toBeNull();
  });

  it('falls back to image clipboard items when the file list is empty', () => {
    const imageFile = new File(['pixels'], 'clipboard.webp', { type: 'image/webp' });
    const clipboard = {
      files: [],
      items: [
        { kind: 'string', type: 'text/plain', getAsFile: () => null },
        { kind: 'file', type: 'image/webp', getAsFile: () => imageFile }
      ]
    } as unknown as DataTransfer;

    expect(firstImageFromClipboard(clipboard)).toBe(imageFile);
  });

  it('creates readable alt text for both Windows and POSIX paths', () => {
    expect(imageAltFromPath('C:\\papers\\result_chart-01.png')).toBe('result chart 01');
    expect(imageAltFromPath('/tmp/diagram.svg')).toBe('diagram');
  });

  it('encodes binary clipboard data without corrupting chunk boundaries', async () => {
    const bytes = new Uint8Array(0x8000 + 3);
    bytes[0] = 1;
    bytes[0x8000] = 2;
    bytes[0x8001] = 3;
    bytes[0x8002] = 255;
    const file = new File([bytes], 'large.png', { type: 'image/png' });
    Object.defineProperty(file, 'arrayBuffer', {
      value: async () => bytes.buffer
    });

    expect(await fileToBase64(file)).toBe(window.btoa(String.fromCharCode(...bytes)));
  });
});
