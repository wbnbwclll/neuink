/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { readStoredReaderPreferences } from '@/shared/lib/readerPreferences';

import { ReflowComponentControls } from './ReflowComponentControls';

describe('ReflowComponentControls', () => {
  afterEach(() => cleanup());

  it('updates one component without replacing the other component settings', () => {
    const preferences = readStoredReaderPreferences();
    const onChange = vi.fn();
    render(<ReflowComponentControls preferences={preferences} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: '重排组件设置' }));
    fireEvent.click(screen.getByRole('switch', { name: '显示解析图表' }));

    expect(onChange).toHaveBeenCalledWith({
      ...preferences,
      reflowComponents: {
        ...preferences.reflowComponents,
        chart: { ...preferences.reflowComponents.chart, visible: false }
      }
    });
  });

  it('can disable parsed Mermaid diagrams and image detail opening independently', () => {
    const preferences = readStoredReaderPreferences();
    const onChange = vi.fn();
    render(<ReflowComponentControls preferences={preferences} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: '重排组件设置' }));
    fireEvent.click(screen.getByRole('switch', { name: '显示 Mermaid 流程图' }));
    fireEvent.click(screen.getByRole('switch', { name: '点击图片查看详情' }));

    expect(onChange).toHaveBeenNthCalledWith(1, {
      ...preferences,
      reflowComponents: { ...preferences.reflowComponents, diagramVisible: false }
    });
    expect(onChange).toHaveBeenNthCalledWith(2, {
      ...preferences,
      reflowComponents: { ...preferences.reflowComponents, imageClickToOpen: false }
    });
  });
});
