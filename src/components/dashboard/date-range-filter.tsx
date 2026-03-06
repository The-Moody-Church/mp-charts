'use client';

import { useCallback, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

/** Represents the user's date range selection */
export interface DateRangeSelection {
  months: number[]; // 0-11 (Jan=0, Sep=8, etc.)
  years: number[];
  compare: boolean;
}

interface DateRangeFilterProps {
  selection: DateRangeSelection;
  onSelectionChange: (selection: DateRangeSelection) => void;
  disabled?: boolean;
}

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

/** Ministry year months: Sep(8) through May(4) */
const MINISTRY_YEAR_MONTHS = [8, 9, 10, 11, 0, 1, 2, 3, 4];

/** Semester presets */
const FALL_SEMESTER_MONTHS = [8, 9, 10]; // Sep, Oct, Nov
const SPRING_SEMESTER_MONTHS = [1, 2, 3]; // Feb, Mar, Apr
const SUMMER_MONTHS = [5, 6, 7]; // Jun, Jul, Aug

function getCurrentMinistryYear(): number {
  const today = new Date();
  return today.getMonth() >= 8
    ? today.getFullYear()
    : today.getFullYear() - 1;
}

/** Builds the list of month buttons in ministry year order (Sep through Aug) */
function getOrderedMonths(): number[] {
  return [8, 9, 10, 11, 0, 1, 2, 3, 4, 5, 6, 7];
}

/** Returns the available year range (current year back 4 years) */
function getAvailableYears(): number[] {
  const currentMinistryYear = getCurrentMinistryYear();
  const years: number[] = [];
  for (let y = currentMinistryYear - 4; y <= currentMinistryYear; y++) {
    years.push(y);
  }
  return years;
}

/** Check if the current selection matches a specific month preset (current year only) */
function isPresetMatch(selection: DateRangeSelection, presetMonths: number[]): boolean {
  const currentMinistryYear = getCurrentMinistryYear();
  if (selection.years.length !== 1 || selection.years[0] !== currentMinistryYear) {
    return false;
  }
  if (selection.months.length !== presetMonths.length) {
    return false;
  }
  return presetMonths.every(m => selection.months.includes(m));
}

/**
 * Convert a DateRangeSelection into a start and end date.
 * When years + months are selected, the range spans the earliest
 * selected year/month to the end of the latest selected year/month.
 */
export function selectionToDateRange(selection: DateRangeSelection): {
  startDate: Date;
  endDate: Date;
} {
  const { months, years } = selection;
  if (months.length === 0 || years.length === 0) {
    // Fallback: current ministry year (Sep - Aug)
    const my = getCurrentMinistryYear();
    return {
      startDate: new Date(my, 8, 1),
      endDate: new Date(my + 1, 7, 31)
    };
  }

  // Build all (year, month) pairs
  // For each selected year, treat it as a ministry year starting in Sep of that year.
  // Months Sep-Dec belong to the base year; months Jan-Aug belong to the next calendar year.
  const pairs: { calendarYear: number; month: number }[] = [];
  for (const year of years) {
    for (const month of months) {
      const calendarYear = month >= 8 ? year : year + 1;
      pairs.push({ calendarYear, month });
    }
  }

  // Sort by actual date
  pairs.sort((a, b) => {
    if (a.calendarYear !== b.calendarYear) return a.calendarYear - b.calendarYear;
    return a.month - b.month;
  });

  const first = pairs[0];
  const last = pairs[pairs.length - 1];

  const startDate = new Date(first.calendarYear, first.month, 1);
  // End date is last day of the last month
  const endDate = new Date(last.calendarYear, last.month + 1, 0);

  return { startDate, endDate };
}

/** Compute the previous-period date range by shifting back one year */
export function getPreviousPeriodRange(startDate: Date, endDate: Date): {
  startDate: Date;
  endDate: Date;
} {
  const prevStart = new Date(startDate);
  prevStart.setFullYear(prevStart.getFullYear() - 1);
  const prevEnd = new Date(endDate);
  prevEnd.setFullYear(prevEnd.getFullYear() - 1);
  return { startDate: prevStart, endDate: prevEnd };
}

/** Get the default selection: current ministry year with compare on */
export function getDefaultSelection(): DateRangeSelection {
  return {
    months: [...MINISTRY_YEAR_MONTHS],
    years: [getCurrentMinistryYear()],
    compare: true
  };
}

export function DateRangeFilter({
  selection,
  onSelectionChange,
  disabled = false
}: DateRangeFilterProps) {
  const orderedMonths = useMemo(() => getOrderedMonths(), []);
  const availableYears = useMemo(() => getAvailableYears(), []);
  const isMinistryYear = isPresetMatch(selection, MINISTRY_YEAR_MONTHS);
  const isFallSemester = isPresetMatch(selection, FALL_SEMESTER_MONTHS);
  const isSpringSemester = isPresetMatch(selection, SPRING_SEMESTER_MONTHS);
  const isSummer = isPresetMatch(selection, SUMMER_MONTHS);

  // Track the last clicked month index (in ministry year order) for shift+click range selection
  const lastClickedMonthIdx = useRef<number | null>(null);

  const toggleMonth = useCallback(
    (month: number, ctrlKey: boolean, shiftKey: boolean) => {
      const ordered = getOrderedMonths();
      const clickedIdx = ordered.indexOf(month);

      let newMonths: number[];
      if (shiftKey && lastClickedMonthIdx.current !== null) {
        // Shift+click: select range from last clicked to current
        const startIdx = Math.min(lastClickedMonthIdx.current, clickedIdx);
        const endIdx = Math.max(lastClickedMonthIdx.current, clickedIdx);
        const rangeMonths = ordered.slice(startIdx, endIdx + 1);
        if (ctrlKey) {
          // Shift+Ctrl: add range to existing selection
          const combined = new Set([...selection.months, ...rangeMonths]);
          newMonths = [...combined];
        } else {
          // Shift only: replace selection with range
          newMonths = rangeMonths;
        }
      } else if (ctrlKey) {
        // Multi-select: toggle this month, then fill gaps so the visual
        // selection matches the actual date range (which spans min→max)
        let toggled: number[];
        if (selection.months.includes(month)) {
          toggled = selection.months.filter(m => m !== month);
        } else {
          toggled = [...selection.months, month];
        }
        // Fill in all months between min and max in ministry-year order
        if (toggled.length >= 2) {
          const indices = toggled.map(m => ordered.indexOf(m));
          const minIdx = Math.min(...indices);
          const maxIdx = Math.max(...indices);
          newMonths = ordered.slice(minIdx, maxIdx + 1);
        } else {
          newMonths = toggled;
        }
      } else {
        // Single-select: replace with just this month
        if (selection.months.length === 1 && selection.months[0] === month) {
          // Clicking the only selected month - deselect (will fall back to default)
          newMonths = [];
        } else {
          newMonths = [month];
        }
      }

      lastClickedMonthIdx.current = clickedIdx;
      onSelectionChange({ ...selection, months: newMonths });
    },
    [selection, onSelectionChange]
  );

  const toggleYear = useCallback(
    (year: number, ctrlKey: boolean) => {
      let newYears: number[];
      if (ctrlKey) {
        // Ctrl+click: add this year to selection (never remove)
        if (!selection.years.includes(year)) {
          newYears = [...selection.years, year];
        } else {
          newYears = selection.years;
        }
      } else {
        // Single click: always select this year
        newYears = [year];
      }
      // Auto-select all 12 months when clicking a year
      const allMonths = getOrderedMonths();
      onSelectionChange({ ...selection, months: [...allMonths], years: newYears });
    },
    [selection, onSelectionChange]
  );

  const handleMinistryYearPreset = useCallback(() => {
    onSelectionChange(getDefaultSelection());
  }, [onSelectionChange]);

  const handlePreset = useCallback((months: number[]) => {
    onSelectionChange({
      months: [...months],
      years: [getCurrentMinistryYear()],
      compare: selection.compare
    });
  }, [onSelectionChange, selection.compare]);

  const handleCompareToggle = useCallback(
    (checked: boolean | 'indeterminate') => {
      onSelectionChange({ ...selection, compare: checked === true });
    },
    [selection, onSelectionChange]
  );

  /** Format a ministry year label like "2025-26" */
  const formatYearLabel = (year: number) => {
    return `${year}-${String(year + 1).slice(2)}`;
  };

  return (
    <div className="space-y-3">
      {/* Month buttons row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-muted-foreground w-14 shrink-0">Months</span>
        <div className="flex gap-1 flex-wrap">
          {orderedMonths.map(month => (
            <Button
              key={month}
              variant={selection.months.includes(month) ? 'default' : 'outline'}
              size="sm"
              disabled={disabled}
              className="h-7 px-2 text-xs min-w-[3rem]"
              onClick={(e) => toggleMonth(month, e.ctrlKey || e.metaKey, e.shiftKey)}
            >
              {MONTH_LABELS[month]}
            </Button>
          ))}
        </div>
      </div>

      {/* Year buttons row + presets + compare */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-muted-foreground w-14 shrink-0">Years</span>
        <div className="flex gap-1 flex-wrap">
          {availableYears.map(year => (
            <Button
              key={year}
              variant={selection.years.includes(year) ? 'default' : 'outline'}
              size="sm"
              disabled={disabled}
              className="h-7 px-2 text-xs"
              onClick={(e) => toggleYear(year, e.ctrlKey || e.metaKey)}
            >
              {formatYearLabel(year)}
            </Button>
          ))}
        </div>

        {/* Separator */}
        <div className="hidden sm:block h-5 w-px bg-border mx-1" />

        {/* Preset buttons */}
        <Button
          variant={isMinistryYear ? 'secondary' : 'outline'}
          size="sm"
          disabled={disabled}
          className="h-7 px-3 text-xs"
          onClick={handleMinistryYearPreset}
        >
          Ministry Year
        </Button>
        <Button
          variant={isFallSemester ? 'secondary' : 'outline'}
          size="sm"
          disabled={disabled}
          className="h-7 px-3 text-xs"
          onClick={() => handlePreset(FALL_SEMESTER_MONTHS)}
        >
          Fall Semester
        </Button>
        <Button
          variant={isSpringSemester ? 'secondary' : 'outline'}
          size="sm"
          disabled={disabled}
          className="h-7 px-3 text-xs"
          onClick={() => handlePreset(SPRING_SEMESTER_MONTHS)}
        >
          Spring Semester
        </Button>
        <Button
          variant={isSummer ? 'secondary' : 'outline'}
          size="sm"
          disabled={disabled}
          className="h-7 px-3 text-xs"
          onClick={() => handlePreset(SUMMER_MONTHS)}
        >
          Summer
        </Button>

        {/* Separator */}
        <div className="hidden sm:block h-5 w-px bg-border mx-1" />

        {/* Compare toggle */}
        <div className="flex items-center gap-1.5">
          <Checkbox
            id="compare-toggle"
            checked={selection.compare}
            onCheckedChange={handleCompareToggle}
            disabled={disabled}
          />
          <Label htmlFor="compare-toggle" className="text-xs cursor-pointer">
            Compare previous period
          </Label>
        </div>
      </div>

      {/* Hint text */}
      <p className="text-xs text-muted-foreground hidden sm:block">
        Hold Ctrl/Cmd to select multiple months or years. Hold Shift to select a range of months.
      </p>
    </div>
  );
}
