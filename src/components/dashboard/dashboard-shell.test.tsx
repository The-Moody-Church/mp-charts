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
  mockGetExtended,
  mockGetEngagement,
} = vi.hoisted(() => ({
  mockRefreshDashboardCache: vi.fn(),
  mockGetExtended: vi.fn(),
  mockGetEngagement: vi.fn(),
}));

// getFullRangeDashboardMetrics is deliberately absent: the shell must not re-read
// the core data after a Refresh (see 'Refresh Data' below).
vi.mock('./actions', () => ({
  refreshDashboardCache: mockRefreshDashboardCache,
  getExtendedDashboardMetrics: mockGetExtended,
  getEngagementDashboardMetrics: mockGetEngagement,
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

/** What refreshDashboardCache returns: a section is present only if it reloaded. */
const refreshed = (sections: { core?: number; extended?: number; engagement?: number }) => ({
  success: sections.core !== undefined && sections.extended !== undefined && sections.engagement !== undefined,
  refused: false,
  timestamp: REFRESHED_AT,
  ...(sections.core !== undefined && { core: core(sections.core) }),
  ...(sections.extended !== undefined && { extended: extended(sections.extended) }),
  ...(sections.engagement !== undefined && { engagement: engagement(sections.engagement) }),
});

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mockRefreshDashboardCache.mockResolvedValue(refreshed({ core: 5, extended: 7, engagement: 42 }));
  mockGetExtended.mockResolvedValue(extended(7));
  mockGetEngagement.mockResolvedValue(engagement(42));
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

  it('applies all three sections the action returns and shows the time, with no second read', async () => {
    await renderLoaded();
    mockGetExtended.mockClear();
    mockGetEngagement.mockClear();
    mockRefreshDashboardCache.mockResolvedValue(refreshed({ core: 6, extended: 8, engagement: 43 }));

    clickRefresh();
    await idle();

    expect(screen.getByTestId('core').textContent).toBe('6');
    expect(screen.getByTestId('serving').textContent).toBe('8');
    expect(screen.getByTestId('venn').textContent).toBe('43');
    expect(screen.getByText(/last refreshed/i)).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    // A second read would be served the old cached value of a section whose
    // reload failed, and report it as refreshed.
    expect(mockGetExtended).not.toHaveBeenCalled();
    expect(mockGetEngagement).not.toHaveBeenCalled();
  });

  // Was a bug: Promise.all rejected on the extended failure, the rejection left
  // the transition, and the error boundary replaced the whole dashboard.
  it('keeps the previous extended data when only its reload fails, and applies the rest', async () => {
    await renderLoaded();
    mockRefreshDashboardCache.mockResolvedValue(refreshed({ core: 6, engagement: 43 })); // core carries serving = 0

    clickRefresh();
    await idle();

    expect(screen.getByTestId('core').textContent).toBe('6');
    expect(screen.getByTestId('serving').textContent).toBe('7'); // not the core result's 0
    expect(screen.getByTestId('venn').textContent).toBe('43');
    expect(screen.getByTestId('flags').textContent).toBe('none');
    expect(screen.getByRole('status').textContent).toMatch(/could not be refreshed/i);
    expect(screen.queryByText(/last refreshed/i)).not.toBeInTheDocument();
  });

  // Was a bug: the action left the core MP fetch to the page render in its own
  // response, and the shell then re-read the core data. A failure there was
  // already spent, so the re-read got the old cached value, the shell showed no
  // warning and set "Last refreshed".
  it('says the core data was not refreshed when the action reports its reload failed', async () => {
    await renderLoaded();
    mockRefreshDashboardCache.mockResolvedValue(refreshed({ extended: 8, engagement: 43 }));

    clickRefresh();
    await idle();

    expect(screen.getByTestId('core').textContent).toBe('3');
    expect(screen.getByTestId('serving').textContent).toBe('8');
    expect(screen.getByRole('status').textContent).toMatch(/previous data is still shown/i);
    expect(screen.queryByText(/last refreshed/i)).not.toBeInTheDocument();
  });

  it('survives the action itself failing, and the next successful Refresh clears the message', async () => {
    await renderLoaded();
    mockRefreshDashboardCache.mockRejectedValue(new Error('network'));

    clickRefresh();
    await idle();
    expect(screen.getByTestId('core').textContent).toBe('3');
    expect(screen.getByTestId('serving').textContent).toBe('7');
    expect(screen.getByRole('status')).toBeInTheDocument();

    mockRefreshDashboardCache.mockResolvedValue(refreshed({ core: 6, extended: 8, engagement: 43 }));
    clickRefresh();
    await idle();
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(screen.getByTestId('core').textContent).toBe('6');
  });

  it('keeps everything on screen when every section fails to reload', async () => {
    await renderLoaded();
    mockRefreshDashboardCache.mockResolvedValue(refreshed({}));

    clickRefresh();
    await idle();
    expect(screen.getByTestId('core').textContent).toBe('3');
    expect(screen.getByTestId('serving').textContent).toBe('7');
    expect(screen.getByTestId('venn').textContent).toBe('42');
    expect(screen.getByTestId('flags').textContent).toBe('none');
    expect(screen.getByRole('status').textContent).toMatch(/previous data is still shown/i);
  });

  it('clears a stage error once a Refresh reloads that stage', async () => {
    mockGetExtended.mockRejectedValueOnce(new Error('MP down'));
    render(<DashboardShell initialData={core(3)} />);
    await waitFor(() => expect(screen.getByTestId('flags').textContent).toBe('extended-error'));

    clickRefresh();
    await idle();
    expect(screen.getByTestId('flags').textContent).toBe('none');
    expect(screen.getByTestId('serving').textContent).toBe('7');
  });

  it('keeps a stage error when its reload fails too and nothing ever loaded', async () => {
    mockGetExtended.mockRejectedValue(new Error('MP down'));
    render(<DashboardShell initialData={core(3)} />);
    await waitFor(() => expect(screen.getByTestId('flags').textContent).toBe('extended-error'));
    mockRefreshDashboardCache.mockResolvedValue(refreshed({ core: 6, engagement: 43 }));

    clickRefresh();
    await idle();
    expect(screen.getByTestId('flags').textContent).toBe('extended-error');
  });

  it('says so when the refresh itself is refused (e.g. rate limited), and leaves a loading stage loading', async () => {
    let releaseEngagement!: (v: unknown) => void;
    mockGetEngagement.mockReturnValue(new Promise((resolve) => (releaseEngagement = resolve)));
    render(<DashboardShell initialData={core(3)} />);
    await waitFor(() => expect(screen.getByTestId('flags').textContent).toBe('engagement-loading'));
    mockRefreshDashboardCache.mockResolvedValue({ success: false, refused: true, timestamp: REFRESHED_AT });

    clickRefresh();
    await idle();
    expect(screen.getByRole('status').textContent).toMatch(/could not be refreshed right now/i);
    expect(screen.queryByText(/last refreshed/i)).not.toBeInTheDocument();
    // Neither an error nor done: its own first load is still on the way.
    expect(screen.getByTestId('flags').textContent).toBe('engagement-loading');

    releaseEngagement(engagement(42));
    await waitFor(() => expect(screen.getByTestId('flags').textContent).toBe('none'));
    expect(screen.getByTestId('venn').textContent).toBe('42');
  });

  it('lets a first load that was still in flight clear the error a failed Refresh set', async () => {
    let releaseEngagement!: (v: unknown) => void;
    mockGetEngagement.mockReturnValue(new Promise((resolve) => (releaseEngagement = resolve)));
    render(<DashboardShell initialData={core(3)} />);
    await waitFor(() => expect(screen.getByTestId('flags').textContent).toBe('engagement-loading'));
    mockRefreshDashboardCache.mockResolvedValue(refreshed({ core: 6, extended: 8 }));

    clickRefresh();
    await idle();
    expect(screen.getByTestId('flags').textContent).toBe('engagement-error');

    releaseEngagement(engagement(42));
    await waitFor(() => expect(screen.getByTestId('flags').textContent).toBe('none'));
    expect(screen.getByTestId('venn').textContent).toBe('42');
  });
});
