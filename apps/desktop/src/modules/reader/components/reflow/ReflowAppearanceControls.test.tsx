/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { readStoredReaderPreferences } from '@/shared/lib/readerPreferences';

import { ReflowAppearanceControls } from './ReflowAppearanceControls';

describe('ReflowAppearanceControls', () => {
  afterEach(() => cleanup());

  it('changes text size without replacing the other reader preferences', () => {
    const preferences = readStoredReaderPreferences();
    const onChange = vi.fn();
    render(<ReflowAppearanceControls preferences={preferences} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: '重排阅读外观' }));
    fireEvent.click(screen.getByRole('button', { name: '增大重排文字' }));

    expect(onChange).toHaveBeenCalledWith({ ...preferences, reflowFontSize: 17 });
  });

  it('offers preset and custom background colors', () => {
    const preferences = readStoredReaderPreferences();
    const onChange = vi.fn();
    render(<ReflowAppearanceControls preferences={preferences} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: '重排阅读外观' }));
    fireEvent.click(screen.getByRole('button', { name: '使用暖白背景' }));
    fireEvent.change(screen.getByLabelText('自定义重排背景颜色'), {
      target: { value: '#223344' }
    });

    expect(onChange).toHaveBeenNthCalledWith(1, {
      ...preferences,
      reflowBackgroundColor: '#fff8ed'
    });
    expect(onChange).toHaveBeenNthCalledWith(2, {
      ...preferences,
      reflowBackgroundColor: '#223344'
    });
  });
});
