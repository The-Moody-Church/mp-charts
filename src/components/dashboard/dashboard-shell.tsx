'use client';

import { useState, useEffect, useTransition, useCallback, useMemo } from 'react';
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
import { refreshDashboardCache, getFullRangeDashboardMetrics, getExtendedDashboardMetrics, getEngagementDashboardMetrics } from './actions';
import { filterDashboardData, isSingleMonthSelection } from './filter-dashboard-data';
import { useRouter } from 'next/navigation';

interface DashboardShellProps {
  /** Full-range data loaded server-side, filtered client-side on selection change */
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
  const [fullData, setFullData] = useState<DashboardData>(initialData);
  const [extendedLoading, setExtendedLoading] = useState(true);
  const [engagementLoading, setEngagementLoading] = useState(true);
  const [isRefreshing, startRefreshTransition] = useTransition();
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Stage 1: Load extended data (serving, EP, roster) — fast
  useEffect(() => {
    let cancelled = false;
    getExtendedDashboardMetrics().then(extended => {
      if (!cancelled) {
        setFullData(prev => ({ ...prev, ...extended }));
        setExtendedLoading(false);
      }
    }).catch(err => {
      console.error('Error loading extended dashboard data:', err);
      if (!cancelled) setExtendedLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  // Stage 2: Load engagement venn data (Activity_Log — slow)
  useEffect(() => {
    let cancelled = false;
    getEngagementDashboardMetrics().then(engagement => {
      if (!cancelled) {
        setFullData(prev => ({ ...prev, ...engagement }));
        setEngagementLoading(false);
      }
    }).catch(err => {
      console.error('Error loading engagement dashboard data:', err);
      if (!cancelled) setEngagementLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const description = useMemo(() => formatSelectionDescription(selection), [selection]);

  // Client-side filtering: derive the displayed data from the full dataset + selection
  const filteredData = useMemo(
    () => filterDashboardData(fullData, selection),
    [fullData, selection]
  );

  const handleSelectionChange = useCallback(
    (newSelection: DateRangeSelection) => {
      setSelection(newSelection);
      // No server call — filteredData is recomputed via useMemo
    },
    []
  );

  const handleRefresh = useCallback(() => {
    startRefreshTransition(async () => {
      const cacheResult = await refreshDashboardCache();
      if (cacheResult.success) {
        setLastRefresh(cacheResult.timestamp);
      }

      // Re-fetch core, extended, and engagement data
      const [freshData, extended, engagement] = await Promise.all([
        getFullRangeDashboardMetrics(),
        getExtendedDashboardMetrics(),
        getEngagementDashboardMetrics(),
      ]);
      setFullData({ ...freshData, ...extended, ...engagement });
      setExtendedLoading(false);
      setEngagementLoading(false);
      router.refresh();
    });
  }, [router]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight">Executive Dashboard</h1>
          <div className="flex items-center gap-2">
            {lastRefresh && (
              <p className="text-xs text-muted-foreground">
                Last refreshed: {lastRefresh.toLocaleTimeString()}
              </p>
            )}
            <Button
              onClick={handleRefresh}
              disabled={isRefreshing}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
            </Button>
          </div>
        </div>

        <p className="text-muted-foreground">
          Church health metrics across discipleship, community, serving, and giving for {description}
        </p>

        {/* Date Range Filter */}
        <DateRangeFilter
          selection={selection}
          onSelectionChange={handleSelectionChange}
          disabled={isRefreshing}
        />
      </div>

      {/* Dashboard Content */}
      <div className={isRefreshing ? 'opacity-60 pointer-events-none transition-opacity' : 'transition-opacity'}>
        <DashboardMetrics
          data={filteredData}
          showCompare={selection.compare}
          isSingleMonth={isSingleMonthSelection(selection)}
          extendedLoading={extendedLoading}
          engagementLoading={engagementLoading}
        />
      </div>
    </div>
  );
}
