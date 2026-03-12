import { describe, it, expect } from 'vitest';
import { computeLayout } from '../venn-diagram';
import type { EngagementOverlap } from '@/lib/dto';

const emptyOverlap: EngagementOverlap = {
  activityOnly: 0, groupOnly: 0, servingOnly: 0,
  activityAndGroup: 0, activityAndServing: 0, groupAndServing: 0,
  allThree: 0, totalActivity: 0, totalGroup: 0, totalServing: 0,
};

const typicalOverlap: EngagementOverlap = {
  activityOnly: 50, groupOnly: 30, servingOnly: 20,
  activityAndGroup: 40, activityAndServing: 15, groupAndServing: 10,
  allThree: 25, totalActivity: 130, totalGroup: 105, totalServing: 70,
};

describe('computeLayout', () => {
  describe('attendance circle visibility', () => {
    it('shows attendance circle when engagement circles exist and attendance > 0', () => {
      const layout = computeLayout(typicalOverlap, 500);
      expect(layout.attendanceCircle).not.toBeNull();
      expect(layout.attendanceCircle!.r).toBeGreaterThan(0);
    });

    it('shows attendance circle even when all engagement circles are empty', () => {
      const layout = computeLayout(emptyOverlap, 500);
      expect(layout.attendanceCircle).not.toBeNull();
      expect(layout.attendanceCircle!.r).toBeGreaterThan(0);
    });

    it('hides attendance circle when attendance is 0', () => {
      const layout = computeLayout(typicalOverlap, 0);
      expect(layout.attendanceCircle).toBeNull();
    });

    it('hides attendance circle when attendance is undefined', () => {
      const layout = computeLayout(typicalOverlap);
      expect(layout.attendanceCircle).toBeNull();
    });
  });

  describe('attendance circle sizing', () => {
    it('sizes attendance circle relative to engagement circles when present', () => {
      const layout = computeLayout(typicalOverlap, 500);
      // maxT = max(130, 105, 70) = 130
      // rAttendance = 120 * sqrt(500/130) ≈ 235
      expect(layout.attendanceCircle!.r).toBeGreaterThan(120);
    });

    it('sizes attendance circle at MAX_R when no engagement circles exist', () => {
      const layout = computeLayout(emptyOverlap, 500);
      // scaleRef = averageTotalAttendance = 500
      // rAttendance = 120 * sqrt(500/500) = 120
      expect(layout.attendanceCircle!.r).toBe(120);
    });
  });

  describe('engagement circles', () => {
    it('produces non-zero circles for non-zero engagement data', () => {
      const layout = computeLayout(typicalOverlap);
      const [cA, cB, cC] = layout.circles;
      expect(cA.r).toBeGreaterThan(0);
      expect(cB.r).toBeGreaterThan(0);
      expect(cC.r).toBeGreaterThan(0);
    });

    it('produces zero circles for empty engagement data', () => {
      const layout = computeLayout(emptyOverlap);
      const [cA, cB, cC] = layout.circles;
      expect(cA.r).toBe(0);
      expect(cB.r).toBe(0);
      expect(cC.r).toBe(0);
    });
  });

  describe('viewBox', () => {
    it('produces a valid viewBox when only attendance circle exists', () => {
      const layout = computeLayout(emptyOverlap, 500);
      expect(layout.vb).toMatch(/^-?\d+(\.\d+)?\s+-?\d+(\.\d+)?\s+\d+(\.\d+)?\s+\d+(\.\d+)?$/);
      // Width and height should be positive
      const parts = layout.vb.split(' ').map(Number);
      expect(parts[2]).toBeGreaterThan(0);
      expect(parts[3]).toBeGreaterThan(0);
    });
  });
});
