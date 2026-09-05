import { createContext, useContext, type ReactNode } from 'react';

import {
  DEFAULT_REFLOW_COMPONENT_PREFERENCES,
  reflowTextSizeScale,
  type ReflowComponentPreferences
} from '@/shared/lib/readerPreferences';

import type { ReflowSegmentGroup } from './buildReflowBlocks';

type ReflowComponentKey = keyof Pick<
  ReflowComponentPreferences,
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'table'
  | 'math'
  | 'code'
  | 'supportingText'
  | 'figure'
  | 'chart'
>;

const ReflowComponentPreferencesContext = createContext(
  DEFAULT_REFLOW_COMPONENT_PREFERENCES
);

export function ReflowComponentPreferencesProvider({
  children,
  value
}: {
  children: ReactNode;
  value: ReflowComponentPreferences;
}) {
  return (
    <ReflowComponentPreferencesContext.Provider value={value}>
      {children}
    </ReflowComponentPreferencesContext.Provider>
  );
}

export function useReflowComponentPreferences() {
  return useContext(ReflowComponentPreferencesContext);
}

export function isReflowGroupVisible(
  group: ReflowSegmentGroup,
  preferences: ReflowComponentPreferences
) {
  if (!preferences[reflowComponentKeyForGroup(group)].visible) {
    return false;
  }

  return preferences.diagramVisible || !isMermaidOnlySegment(group);
}

export function reflowGroupTextScale(
  group: ReflowSegmentGroup,
  preferences: ReflowComponentPreferences
) {
  const key = reflowComponentKeyForGroup(group);
  if (key === 'figure' || key === 'chart') return 1;
  return reflowTextSizeScale(preferences[key].size);
}

export function reflowGroupEstimateScale(
  group: ReflowSegmentGroup,
  preferences: ReflowComponentPreferences
) {
  const key = reflowComponentKeyForGroup(group);
  if (key !== 'figure' && key !== 'chart') {
    return reflowTextSizeScale(preferences[key].size);
  }

  const size = preferences[key].size;
  return size === 'compact' ? 0.75 : size === 'large' ? 1.5 : size === 'full' ? 1.8 : 1;
}

export function reflowComponentKeyForGroup(group: ReflowSegmentGroup): ReflowComponentKey {
  if (group.body.raw_type === 'chart') return 'chart';
  if (group.body.raw_type === 'image' || group.body.segment_type === 'figure') return 'figure';

  switch (group.body.segment_type) {
    case 'heading':
      return 'heading';
    case 'list':
      return 'list';
    case 'table':
      return 'table';
    case 'math':
      return 'math';
    case 'code':
      return 'code';
    case 'page_footnote':
    case 'aside_text':
      return 'supportingText';
    default:
      return 'paragraph';
  }
}

function isMermaidOnlySegment(group: ReflowSegmentGroup) {
  const markdown = (group.body.markdown ?? group.body.text).trim();
  return /^```mermaid\s+[\s\S]*```$/i.test(markdown);
}
