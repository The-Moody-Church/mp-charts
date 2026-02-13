'use client';

import { useState, useTransition, useCallback, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DashboardData } from '@/lib/dto';
import { DashboardMetrics } from './dashboard-metrics';
import {
  DateRangeFilter,
  DateRangeSelection,
  getDefaultSelection,
  selectionToDateRange,
} from './date-range-filter';
import { getDashboardMetricsByDateRange, refreshDashboardCache } from './actions';
import { useRouter } from 'next/navigation';

interface DashboardShellProps {
  /** Initial data loaded server-side for the default ministry year */
  initialData: DashboardData;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/** Format the selected date range as a human-readable description */
function formatSelectionDescription(selection: DateRangeSelection): string {
  const { startDate, endDate } = selectionToDateRange(selection);
  const startMonth = MONTH_NAMES[startDate.getMonth()];
  const endMonth = MONTH_NAMES[endDate.getMonth()];
  const startYear = startDate.getFullYear();
  const endYear = endDate.getFullYear();

  if (startYear === endYear) {
    if (startDate.getMonth() === endDate.getMonth()) {
      return `${startMonth} ${startYear}`;
    }
    return `${startMonth} - ${endMonth} ${startYear}`;
  }
  return `${startMonth} ${startYear} - ${endMonth} ${endYear}`;
}

export function DashboardShell({ initialData }: DashboardShellProps) {
  const router = useRouter();
  const [selection, setSelection] = useState<DateRangeSelection>(getDefaultSelection);
  const [data, setData] = useState<DashboardData>(initialData);
  const [isFiltering, startFilterTransition] = useTransition();
  const [isRefreshing, startRefreshTransition] = useTransition();
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const isPending = isFiltering || isRefreshing;

  const description = useMemo(() => formatSelectionDescription(selection), [selection]);

  const handleSelectionChange = useCallback(
    (newSelection: DateRangeSelection) => {
      setSelection(newSelection);

      // Don't fetch if the selection is incomplete
      if (newSelection.months.length === 0 || newSelection.years.length === 0) {
        return;
      }

      const { startDate, endDate } = selectionToDateRange(newSelection);

      startFilterTransition(async () => {
        const result = await getDashboardMetricsByDateRange(
          startDate.toISOString(),
          endDate.toISOString()
        );
        setData(result);
      });
    },
    []
  );

  const handleRefresh = useCallback(() => {
    startRefreshTransition(async () => {
      const cacheResult = await refreshDashboardCache();
      if (cacheResult.success) {
        setLastRefresh(cacheResult.timestamp);
      }

      // Re-fetch data with current selection
      const { startDate, endDate } = selectionToDateRange(selection);
      const result = await getDashboardMetricsByDateRange(
        startDate.toISOString(),
        endDate.toISOString()
      );
      setData(result);
      router.refresh();
    });
  }, [selection, router]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-4xl font-bold tracking-tight">Executive Dashboard</h1>
          <div className="flex items-center gap-2">
            {lastRefresh && (
              <p className="text-xs text-muted-foreground">
                Last refreshed: {lastRefresh.toLocaleTimeString()}
              </p>
            )}
            <Button
              onClick={handleRefresh}
              disabled={isPending}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
            </Button>
          </div>
        </div>

        <p className="text-muted-foreground">
          Worship Services attendance and group participation metrics for {description}
        </p>

        {/* Date Range Filter */}
        <DateRangeFilter
          selection={selection}
          onSelectionChange={handleSelectionChange}
          disabled={isPending}
        />
      </div>

      {/* Dashboard Content */}
      <div className={isPending ? 'opacity-60 pointer-events-none transition-opacity' : 'transition-opacity'}>
        <DashboardMetrics data={data} showCompare={selection.compare} />
      </div>
    </div>
  );
}
