import { describe, it, expect } from 'vitest';
import { validateJourneyToolConfig, generateSlug, generateUniqueSlug, mergeSavedMilestones } from './journey-tools-config-types';

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

describe('mergeSavedMilestones', () => {
  const mp = [
    { Milestone_ID: 1, Milestone_Title: 'Attend Class', Sort_Order: 1 },
    { Milestone_ID: 2, Milestone_Title: 'Interview', Sort_Order: 2 },
  ];

  it('returns MP defaults when nothing is saved', () => {
    expect(mergeSavedMilestones(mp, [])).toEqual([
      { milestoneId: 1, label: 'Attend Class', sortOrder: 1, visible: true },
      { milestoneId: 2, label: 'Interview', sortOrder: 2, visible: true },
    ]);
  });

  it('preserves a saved entry verbatim — custom label, hidden flag and drag order survive', () => {
    const saved = [
      { milestoneId: 2, label: 'Pastor Interview', sortOrder: 1, visible: false },
    ];
    const merged = mergeSavedMilestones(mp, saved);

    // This is the highest-consequence behavior in the editor: reopening an
    // existing tool must not silently reset an admin's customisations.
    expect(merged.find((m) => m.milestoneId === 2)).toEqual(saved[0]);
  });

  it('surfaces milestones added in MP since the tool was configured', () => {
    const saved = [{ milestoneId: 1, label: 'Attend Class', sortOrder: 1, visible: true }];
    const merged = mergeSavedMilestones(mp, saved);

    expect(merged).toHaveLength(2);
    expect(merged.find((m) => m.milestoneId === 2)).toEqual({
      milestoneId: 2, label: 'Interview', sortOrder: 2, visible: true,
    });
  });

  it('drops saved milestones MP no longer returns (discontinued)', () => {
    const saved = [
      { milestoneId: 1, label: 'Attend Class', sortOrder: 1, visible: true },
      { milestoneId: 99, label: 'Retired Step', sortOrder: 3, visible: true },
    ];
    const merged = mergeSavedMilestones(mp, saved);

    expect(merged.map((m) => m.milestoneId)).toEqual([1, 2]);
  });

  it('falls back to positional order when MP Sort_Order is null', () => {
    const unordered = [{ Milestone_ID: 5, Milestone_Title: 'Only', Sort_Order: null }];
    expect(mergeSavedMilestones(unordered, [])[0].sortOrder).toBe(1);
  });
});
