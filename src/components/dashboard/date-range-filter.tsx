'use client';

import { useCallback, useMemo } from 'react';
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

function getCurrentMinistryYear(): number {
  const today = new Date();
  return today.getMonth() >= 8
    ? today.getFullYear()
    : today.getFullYear() - 1;
}

/** Builds the list of month buttons ordered by recency (current month rightmost) */
function getOrderedMonths(): number[] {
  const now = new Date();
  const currentMonth = now.getMonth();
  // 12 months ending at the current month, oldest on left
  const months: number[] = [];
  for (let i = 11; i >= 0; i--) {
    months.push((currentMonth - i + 12) % 12);
  }
  return months;
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

/** Check if the current selection matches the ministry year preset */
function isMinistryYearPreset(selection: DateRangeSelection): boolean {
  const currentMinistryYear = getCurrentMinistryYear();
  if (selection.years.length !== 1 || selection.years[0] !== currentMinistryYear) {
    return false;
  }
  if (selection.months.length !== MINISTRY_YEAR_MONTHS.length) {
    return false;
  }
  return MINISTRY_YEAR_MONTHS.every(m => selection.months.includes(m));
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
    // Fallback: current ministry year
    const my = getCurrentMinistryYear();
    return {
      startDate: new Date(my, 8, 1),
      endDate: new Date(my + 1, 4, 31)
    };
  }

  // Build all (year, month) pairs
  // For each selected year, treat it as a ministry year starting in Sep of that year.
  // Months Sep-Dec belong to the base year; months Jan-May belong to the next calendar year.
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
  const isPreset = isMinistryYearPreset(selection);

  const toggleMonth = useCallback(
    (month: number, ctrlKey: boolean) => {
      let newMonths: number[];
      if (ctrlKey) {
        // Multi-select: toggle this month
        if (selection.months.includes(month)) {
          newMonths = selection.months.filter(m => m !== month);
        } else {
          newMonths = [...selection.months, month];
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
      onSelectionChange({ ...selection, months: newMonths });
    },
    [selection, onSelectionChange]
  );

  const toggleYear = useCallback(
    (year: number, ctrlKey: boolean) => {
      let newYears: number[];
      if (ctrlKey) {
        if (selection.years.includes(year)) {
          newYears = selection.years.filter(y => y !== year);
        } else {
          newYears = [...selection.years, year];
        }
      } else {
        if (selection.years.length === 1 && selection.years[0] === year) {
          newYears = [];
        } else {
          newYears = [year];
        }
      }
      onSelectionChange({ ...selection, years: newYears });
    },
    [selection, onSelectionChange]
  );

  const handleMinistryYearPreset = useCallback(() => {
    onSelectionChange(getDefaultSelection());
  }, [onSelectionChange]);

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
              onClick={(e) => toggleMonth(month, e.ctrlKey || e.metaKey)}
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
        <div className="h-5 w-px bg-border mx-1" />

        {/* Ministry Year preset */}
        <Button
          variant={isPreset ? 'secondary' : 'outline'}
          size="sm"
          disabled={disabled}
          className="h-7 px-3 text-xs"
          onClick={handleMinistryYearPreset}
        >
          Ministry Year
        </Button>

        {/* Separator */}
        <div className="h-5 w-px bg-border mx-1" />

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
      <p className="text-xs text-muted-foreground">
        Hold Ctrl/Cmd to select multiple months or years
      </p>
    </div>
  );
}
