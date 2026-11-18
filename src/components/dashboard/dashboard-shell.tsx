'use client';

import { useState, useEffect, useTransition, useCallback, useMemo, useRef } from 'react';
import { RefreshCw, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DashboardData, DashboardRefreshResult } from '@/lib/dto';
import { DashboardMetrics } from './dashboard-metrics';
import {
  DateRangeFilter,
  DateRangeSelection,
  getDefaultSelection,
  selectionToDateRange,
} from './date-range-filter';
import { refreshDashboardCache, getExtendedDashboardMetrics, getEngagementDashboardMetrics } from './actions';
import { filterDashboardData, isSingleMonthSelection } from './filter-dashboard-data';

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
  const [selection, setSelection] = useState<DateRangeSelection>(getDefaultSelection);
  const [fullData, setFullData] = useState<DashboardData>(initialData);
  const [extendedLoading, setExtendedLoading] = useState(true);
  const [engagementLoading, setEngagementLoading] = useState(true);
  // A stage that failed with nothing loaded before: its cards say "unavailable"
  // instead of rendering getDashboardData's placeholder zeros as real numbers.
  const [extendedError, setExtendedError] = useState(false);
  const [engagementError, setEngagementError] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  // The last extended/engagement data that loaded, so a Refresh whose core read
  // succeeds but whose extended read fails keeps them instead of the core
  // result's placeholder defaults.
  const extendedRef = useRef<Partial<DashboardData> | null>(null);
  const engagementRef = useRef<Partial<DashboardData> | null>(null);
  const [isRefreshing, startRefreshTransition] = useTransition();
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [filterExpanded, setFilterExpanded] = useState(false);

  // Stage 1: Load extended data (serving, EP, roster) — fast
  useEffect(() => {
    let cancelled = false;
    getExtendedDashboardMetrics().then(extended => {
      if (!cancelled) {
        extendedRef.current = extended;
        setFullData(prev => ({ ...prev, ...extended }));
        setExtendedError(false); // a Refresh that failed while this was in flight may have set it
        setExtendedLoading(false);
      }
    }).catch(err => {
      console.error('Error loading extended dashboard data:', err);
      if (!cancelled) {
        setExtendedError(true);
        setExtendedLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Stage 2: Load engagement venn data (Activity_Log — slow)
  useEffect(() => {
    let cancelled = false;
    getEngagementDashboardMetrics().then(engagement => {
      if (!cancelled) {
        engagementRef.current = engagement;
        setFullData(prev => ({ ...prev, ...engagement }));
        setEngagementError(false); // a Refresh that failed while this was in flight may have set it
        setEngagementLoading(false);
      }
    }).catch(err => {
      console.error('Error loading engagement dashboard data:', err);
      if (!cancelled) {
        setEngagementError(true);
        setEngagementLoading(false);
      }
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
      // Nothing here may throw: an error escaping a transition goes to the route's
      // error boundary, which would replace data the user already has with an
      // error page. Each part that fails keeps what is on screen instead.
      //
      // refreshDashboardCache reloads every section from MP itself and returns the
      // ones that reloaded, so there is no second read here: a second read would be
      // served the old cached value of a section whose reload failed, and report
      // success.
      setRefreshError(null);
      const result: DashboardRefreshResult = await refreshDashboardCache().catch((err: unknown) => {
        console.error('Error refreshing dashboard cache:', err);
        return { success: false, refused: true, timestamp: new Date() };
      });

      if (result.extended) {
        extendedRef.current = result.extended;
        setExtendedError(false);
      } else if (!extendedRef.current && !result.refused) {
        setExtendedError(true);
      }
      if (result.engagement) {
        engagementRef.current = result.engagement;
        setEngagementError(false);
      } else if (!engagementRef.current && !result.refused) {
        setEngagementError(true);
      }

      const freshCore = result.core;
      setFullData(prev => ({
        ...(freshCore ?? prev),
        ...(extendedRef.current ?? {}),
        ...(engagementRef.current ?? {}),
      }));
      // A refused refresh leaves a stage that is still loading to its own effect.
      if (!result.refused) {
        setExtendedLoading(false);
        setEngagementLoading(false);
      }

      if (result.refused) {
        setRefreshError('The dashboard could not be refreshed right now, so the cached data is still shown. Try again later.');
      } else if (!result.success) {
        setRefreshError('Some data could not be refreshed from Ministry Platform, so the previous data is still shown. Try again in a few minutes.');
      } else {
        setLastRefresh(result.timestamp);
      }
    });
  }, []);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight">Dashboard: Journey of a Lifetime</h1>
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

        {refreshError && (
          <p role="status" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            {refreshError}
          </p>
        )}

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setFilterExpanded(prev => !prev)}
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors group"
          >
            <span>Metrics for <span className="underline decoration-dotted underline-offset-4 group-hover:decoration-solid">{description}</span></span>
            <ChevronDown className={`h-4 w-4 transition-transform ${filterExpanded ? 'rotate-180' : ''}`} />
          </button>

          {filterExpanded && (
            <DateRangeFilter
              selection={selection}
              onSelectionChange={handleSelectionChange}
              disabled={isRefreshing}
            />
          )}
        </div>
      </div>

      {/* Dashboard Content */}
      <div className={isRefreshing ? 'opacity-60 pointer-events-none transition-opacity' : 'transition-opacity'}>
        <DashboardMetrics
          data={filteredData}
          showCompare={selection.compare}
          isSingleMonth={isSingleMonthSelection(selection)}
          extendedLoading={extendedLoading}
          engagementLoading={engagementLoading}
          extendedError={extendedError}
          engagementError={engagementError}
        />
      </div>
    </div>
  );
}
