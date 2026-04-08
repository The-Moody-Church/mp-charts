import { describe, it, expect } from 'vitest';
import { validateJourneyToolConfig, generateSlug, generateUniqueSlug } from './journey-tools-config-types';

describe('generateSlug', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(generateSlug('Baptism Processing')).toBe('baptism-processing');
  });

  it('strips leading and trailing hyphens', () => {
    expect(generateSlug('--test--')).toBe('test');
  });

  it('replaces multiple non-alphanumeric chars with single hyphen', () => {
    expect(generateSlug('Hello   World!!!')).toBe('hello-world');
  });

  it('handles empty string', () => {
    expect(generateSlug('')).toBe('');
  });
});

describe('generateUniqueSlug', () => {
  it('returns base slug when no conflicts', () => {
    expect(generateUniqueSlug('Baptism', [])).toBe('baptism');
  });

  it('appends -2 when base slug exists', () => {
    expect(generateUniqueSlug('Baptism', ['baptism'])).toBe('baptism-2');
  });

  it('increments suffix until unique', () => {
    expect(generateUniqueSlug('Baptism', ['baptism', 'baptism-2', 'baptism-3'])).toBe('baptism-4');
  });
});

describe('validateJourneyToolConfig', () => {
  const validConfig = {
    slug: 'baptism-new',
    journeyId: 3,
    journeyName: 'Baptism New',
    description: 'Test journey',
    enabled: true,
    milestones: [{
      milestoneId: 1,
      label: 'Step 1',
      sortOrder: 0,
      visible: true,
    }],
    programId: 5,
    trackingGroupId: null,
    pausedGroupId: null,
    defaultGroupRoleId: null,
    supportsPause: false,
    pauseMilestoneId: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  it('accepts valid config', () => {
    expect(validateJourneyToolConfig(validConfig)).toEqual(validConfig);
  });

  it('throws on invalid slug format', () => {
    expect(() => validateJourneyToolConfig({
      ...validConfig,
      slug: 'INVALID SLUG!',
    })).toThrow();
  });

  it('throws on missing required fields', () => {
    expect(() => validateJourneyToolConfig({ slug: 'test' })).toThrow();
  });

  it('accepts optional milestone fields', () => {
    const config = {
      ...validConfig,
      milestones: [{
        milestoneId: 1,
        label: 'Step 1',
        sortOrder: 0,
        visible: true,
        discontinuesJourney: true,
        completionBadge: 'completed' as const,
      }],
    };
    expect(validateJourneyToolConfig(config).milestones[0].discontinuesJourney).toBe(true);
  });
});
