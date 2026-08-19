import { describe, expect, it } from 'vitest';

import {
  AUTO_SUBTOPICS,
  buildResearchExecutionPolicy
} from './configParser';

describe('AUTO_SUBTOPICS', () => {
  it('maps each depth to a default subtopic count', () => {
    expect(AUTO_SUBTOPICS).toEqual({ quick: 2, standard: 4, deep: 6, manual: 4 });
  });
});

describe('buildResearchExecutionPolicy', () => {
  it('expands quick → 1 iteration, series, 1 parallel, queue 2', () => {
    expect(buildResearchExecutionPolicy({ depth: 'quick', mode: 'report' })).toMatchObject({
      depth: 'quick',
      mode: 'report',
      maxIterations: 1,
      maxParallel: 1,
      queueLimit: 2,
      executionMode: 'series'
    });
  });

  it('expands standard → 3 iterations, series, queue 5', () => {
    const policy = buildResearchExecutionPolicy({ depth: 'standard', mode: 'notes' });
    expect(policy.maxIterations).toBe(3);
    expect(policy.executionMode).toBe('series');
    expect(policy.maxParallel).toBe(1);
    expect(policy.queueLimit).toBe(5);
  });

  it('expands deep → 5 iterations, parallel, 3 parallel, queue 8', () => {
    const policy = buildResearchExecutionPolicy({ depth: 'deep', mode: 'report' });
    expect(policy).toMatchObject({
      maxIterations: 5,
      maxParallel: 3,
      queueLimit: 8,
      executionMode: 'parallel'
    });
  });

  it('honors manualMaxIterations in manual mode', () => {
    const policy = buildResearchExecutionPolicy({
      depth: 'manual',
      mode: 'report',
      manualMaxIterations: 2
    });
    expect(policy.maxIterations).toBe(2);
    expect(policy.executionMode).toBe('series');
  });

  it('applies blockMaxIterations when it exceeds the depth default', () => {
    const policy = buildResearchExecutionPolicy({
      depth: 'quick',
      mode: 'report',
      blockMaxIterations: 4
    });
    expect(policy.maxIterations).toBe(4);
  });

  it('keeps the depth default when blockMaxIterations is smaller', () => {
    const policy = buildResearchExecutionPolicy({
      depth: 'deep',
      mode: 'report',
      blockMaxIterations: 2
    });
    expect(policy.maxIterations).toBe(5);
  });

  it('falls back to the depth default when blockMaxIterations is null', () => {
    const policy = buildResearchExecutionPolicy({
      depth: 'standard',
      mode: 'report',
      blockMaxIterations: null
    });
    expect(policy.maxIterations).toBe(3);
  });
});
