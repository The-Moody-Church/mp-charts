/**
 * DashboardShell load and Refresh failure handling.
 *
 * Since #304 a Ministry Platform failure rejects the dashboard reads instead of
 * resolving with zeros. Two things follow for the shell:
 *   - Refresh must not let a rejection escape its transition: React rethrows it
 *     to the route's error boundary, replacing data the user already has with an
 *     error page. Each part that fails keeps what is on screen.
 *   - A stage that fails with nothing loaded before must say so, not render
 *     getDashboardData's placeholder zeros as real numbers.
 *
 * The chart grid and the client-side filter are stubbed: this pins what data and
 * flags the shell hands down, not how the charts draw them.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { DashboardData } from '@/lib/dto';

const {
  mockRefreshDashboardCache,
  mockGetFullRange,
  mockGetExtended,
  mockGetEngagement,
  mockRouterRefresh,
} = vi.hoisted(() => ({
  mockRefreshDashboardCache: vi.fn(),
  mockGetFullRange: vi.fn(),
  mockGetExtended: vi.fn(),
  mockGetEngagement: vi.fn(),
  mockRouterRefresh: vi.fn(),
}));

vi.mock('./actions', () => ({
  refreshDashboardCache: mockRefreshDashboardCache,
  getFullRangeDashboardMetrics: mockGetFullRange,
  getExtendedDashboardMetrics: mockGetExtended,
  getEngagementDashboardMetrics: mockGetEngagement,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}));

vi.mock('./filter-dashboard-data', () => ({
  filterDashboardData: (data: DashboardData) => data,
  isSingleMonthSelection: () => false,
}));

vi.mock('./dashboard-metrics', () => ({
  DashboardMetrics: (props: {
    data: DashboardData;
    extendedLoading: boolean;
    engagementLoading: boolean;
    extendedError: boolean;
    engagementError: boolean;
  }) => (
    <dl>
      <dt>core</dt><dd data-testid="core">{props.data.baptismsCurrentPeriod}</dd>
      <dt>serving</dt><dd data-testid="serving">{props.data.totalServingLeading}</dd>
      <dt>venn</dt><dd data-testid="venn">{props.data.engagementOverlap.totalActivity}</dd>
      <dt>flags</dt>
      <dd data-testid="flags">
        {[
          props.extendedLoading && 'extended-loading',
          props.engagementLoading && 'engagement-loading',
          props.extendedError && 'extended-error',
          props.engagementError && 'engagement-error',
        ].filter(Boolean).join(' ') || 'none'}
      </dd>
    </dl>
  ),
}));

import { DashboardShell } from './dashboard-shell';

/** Only the fields the stub reads; the rest of DashboardData is never touched. */
const core = (baptismsCurrentPeriod: number) =>
  ({
    baptismsCurrentPeriod,
    // Placeholder defaults, as getDashboardData fills them before the extended
    // and engagement stages load.
    totalServingLeading: 0,
    engagementOverlap: { totalActivity: 0 },
  }) as unknown as DashboardData;

const extended = (totalServingLeading: number) => ({ totalServingLeading }) as Partial<DashboardData>;
const engagement = (totalActivity: number) =>
  ({ engagementOverlap: { totalActivity } }) as unknown as Partial<DashboardData>;

const REFRESHED_AT = new Date('2026-11-17T15:00:00Z');

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mockRefreshDashboardCache.mockResolvedValue({ success: true, timestamp: REFRESHED_AT });
  mockGetExtended.mockResolvedValue(extended(7));
  mockGetEngagement.mockResolvedValue(engagement(42));
  mockGetFullRange.mockResolvedValue(core(5));
});

async function renderLoaded() {
  render(<DashboardShell initialData={core(3)} />);
  await waitFor(() => expect(screen.getByTestId('flags').textContent).toBe('none'));
}

describe('initial load', () => {
  it('applies the extended and engagement stages when they load', async () => {
    await renderLoaded();
    expect(screen.getByTestId('serving').textContent).toBe('7');
    expect(screen.getByTestId('venn').textContent).toBe('42');
  });

  it('flags a failed extended stage instead of showing its placeholder zeros as data', async () => {
    mockGetExtended.mockRejectedValue(new Error('MP down'));
    render(<DashboardShell initialData={core(3)} />);
    await waitFor(() => expect(screen.getByTestId('flags').textContent).toBe('extended-error'));
  });

  it('flags a failed engagement stage', async () => {
    mockGetEngagement.mockRejectedValue(new Error('MP down'));
    render(<DashboardShell initialData={core(3)} />);
    await waitFor(() => expect(screen.getByTestId('flags').textContent).toBe('engagement-error'));
  });
});

describe('Refresh Data', () => {
  const clickRefresh = () => fireEvent.click(screen.getByRole('button', { name: /refresh data/i }));
  const idle = () => waitFor(() => expect(screen.getByRole('button', { name: /refresh data/i })).not.toBeDisabled());

  it('applies all three fresh results, shows the time, and refreshes the route', async () => {
    await renderLoaded();
    mockGetFullRange.mockResolvedValue(core(6));
    mockGetExtended.mockResolvedValue(extended(8));
    mockGetEngagement.mockResolvedValue(engagement(43));

    clickRefresh();
    await idle();

    expect(screen.getByTestId('core').textContent).toBe('6');
    expect(screen.getByTestId('serving').textContent).toBe('8');
    expect(screen.getByTestId('venn').textContent).toBe('43');
    expect(screen.getByText(/last refreshed/i)).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(mockRouterRefresh).toHaveBeenCalledTimes(1);
  });

  // Was a bug: Promise.all rejected on the extended failure, the rejection left
  // the transition, and the error boundary replaced the whole dashboard.
  it('keeps the previous extended data when only its refresh fails, and applies the rest', async () => {
    await renderLoaded();
    mockGetFullRange.mockResolvedValue(core(6)); // carries placeholder serving = 0
    mockGetExtended.mockRejectedValue(new Error('Group_Participants timeout'));
    mockGetEngagement.mockResolvedValue(engagement(43));

    clickRefresh();
    await idle();

    expect(screen.getByTestId('core').textContent).toBe('6');
    expect(screen.getByTestId('serving').textContent).toBe('7'); // not the core result's 0
    expect(screen.getByTestId('venn').textContent).toBe('43');
    expect(screen.getByTestId('flags').textContent).toBe('none');
    expect(screen.getByRole('status').textContent).toMatch(/could not be refreshed/i);
    expect(screen.queryByText(/last refreshed/i)).not.toBeInTheDocument();
  });

  it('keeps everything on screen when the core refresh fails, without refreshing the route', async () => {
    await renderLoaded();
    mockGetFullRange.mockRejectedValue(new Error('Event_Metrics timeout'));

    clickRefresh();
    await idle();

    expect(screen.getByTestId('core').textContent).toBe('3');
    expect(screen.getByTestId('serving').textContent).toBe('7');
    expect(screen.getByRole('status').textContent).toMatch(/previous data is still shown/i);
    expect(mockRouterRefresh).not.toHaveBeenCalled();
  });

  it('survives every read failing, and the next successful Refresh clears the message', async () => {
    await renderLoaded();
    mockRefreshDashboardCache.mockRejectedValue(new Error('network'));
    mockGetFullRange.mockRejectedValue(new Error('down'));
    mockGetExtended.mockRejectedValue(new Error('down'));
    mockGetEngagement.mockRejectedValue(new Error('down'));

    clickRefresh();
    await idle();
    expect(screen.getByTestId('core').textContent).toBe('3');
    expect(screen.getByRole('status')).toBeInTheDocument();

    mockRefreshDashboardCache.mockResolvedValue({ success: true, timestamp: REFRESHED_AT });
    mockGetFullRange.mockResolvedValue(core(6));
    mockGetExtended.mockResolvedValue(extended(8));
    mockGetEngagement.mockResolvedValue(engagement(43));
    clickRefresh();
    await idle();
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(screen.getByTestId('core').textContent).toBe('6');
  });

  it('clears a stage error once a Refresh loads that stage', async () => {
    mockGetExtended.mockRejectedValueOnce(new Error('MP down'));
    render(<DashboardShell initialData={core(3)} />);
    await waitFor(() => expect(screen.getByTestId('flags').textContent).toBe('extended-error'));

    clickRefresh();
    await idle();
    expect(screen.getByTestId('flags').textContent).toBe('none');
    expect(screen.getByTestId('serving').textContent).toBe('7');
  });

  it('keeps a stage error when its refresh fails too and nothing ever loaded', async () => {
    mockGetExtended.mockRejectedValue(new Error('MP down'));
    render(<DashboardShell initialData={core(3)} />);
    await waitFor(() => expect(screen.getByTestId('flags').textContent).toBe('extended-error'));

    clickRefresh();
    await idle();
    expect(screen.getByTestId('flags').textContent).toBe('extended-error');
  });

  it('says so when the cache refresh itself is refused (e.g. rate limited)', async () => {
    await renderLoaded();
    mockRefreshDashboardCache.mockResolvedValue({ success: false, timestamp: REFRESHED_AT });

    clickRefresh();
    await idle();
    expect(screen.getByRole('status').textContent).toMatch(/could not be refreshed right now/i);
    expect(screen.queryByText(/last refreshed/i)).not.toBeInTheDocument();
  });
});
