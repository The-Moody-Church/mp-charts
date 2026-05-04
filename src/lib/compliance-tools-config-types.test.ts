import { describe, it, expect } from 'vitest';
import { validateComplianceToolConfig, generateSlug, generateUniqueSlug } from './compliance-tools-config-types';

describe('generateSlug', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(generateSlug('Background Check')).toBe('background-check');
  });

  it('strips leading and trailing hyphens', () => {
    expect(generateSlug('--test--')).toBe('test');
  });
});

describe('generateUniqueSlug', () => {
  it('returns base slug when no conflicts', () => {
    expect(generateUniqueSlug('Safety', [])).toBe('safety');
  });

  it('appends suffix to avoid conflicts', () => {
    expect(generateUniqueSlug('Safety', ['safety'])).toBe('safety-2');
  });
});

describe('validateComplianceToolConfig', () => {
  const validConfig = {
    slug: 'safety-check',
    toolName: 'Safety Check',
    description: 'Annual safety compliance',
    enabled: true,
    groupRoleIds: [1, 2],
    journeyId: null,
    journeyMilestones: [],
    requirements: [{
      requirementId: 1,
      label: 'Background Check',
      type: 'background_check' as const,
      sortOrder: 0,
      visible: true,
    }],
    programId: null,
    trackingGroupId: null,
    defaultGroupRoleId: null,
    supportsPause: false,
    pausedGroupId: null,
    pauseMilestoneId: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  it('accepts valid config', () => {
    expect(validateComplianceToolConfig(validConfig)).toEqual(validConfig);
  });

  it('throws on invalid slug format', () => {
    expect(() => validateComplianceToolConfig({
      ...validConfig,
      slug: 'INVALID!',
    })).toThrow();
  });

  it('throws on missing required fields', () => {
    expect(() => validateComplianceToolConfig({ slug: 'test' })).toThrow();
  });

  it('validates requirement types', () => {
    const bad = {
      ...validConfig,
      requirements: [{ requirementId: 1, label: 'X', type: 'invalid', sortOrder: 0, visible: true }],
    };
    expect(() => validateComplianceToolConfig(bad)).toThrow();
  });

  it('accepts requirementId of 0 (generic background check)', () => {
    const config = {
      ...validConfig,
      requirements: [{ requirementId: 0, label: 'Generic BG', type: 'background_check' as const, sortOrder: 0, visible: true }],
    };
    expect(validateComplianceToolConfig(config).requirements[0].requirementId).toBe(0);
  });

  it('throws when journey is attached but programId is null', () => {
    const config = {
      ...validConfig,
      journeyId: 3,
      journeyMilestones: [
        { milestoneId: 6, label: 'Reference', sortOrder: 1, visible: true },
      ],
      programId: null,
    };
    expect(() => validateComplianceToolConfig(config)).toThrow(/Program is required/);
  });

  it('throws when journey milestones exist but programId is null', () => {
    const config = {
      ...validConfig,
      journeyId: null,
      journeyMilestones: [
        { milestoneId: 6, label: 'Reference', sortOrder: 1, visible: true },
      ],
      programId: null,
    };
    expect(() => validateComplianceToolConfig(config)).toThrow(/Program is required/);
  });

  it('accepts journey + journey milestones when programId is set', () => {
    const config = {
      ...validConfig,
      journeyId: 3,
      journeyMilestones: [
        { milestoneId: 6, label: 'Reference', sortOrder: 1, visible: true },
      ],
      programId: 305,
    };
    expect(validateComplianceToolConfig(config).programId).toBe(305);
  });
});
