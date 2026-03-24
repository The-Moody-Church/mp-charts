# Session Summary — 2026-03-13

## Objectives

- **Issue #104**: Change feedback feature from creating Ministry Platform records to creating GitHub issues

## Work Log

### Feedback → GitHub Issues (#104) ✅ COMPLETED

Replaced the Ministry Platform Feedback_Entries integration with GitHub issue creation via the REST API.

**Files modified:**
- `src/services/feedbackService.ts` — Rewrote: removed MPHelper dependency, now creates GitHub issues via REST API with `user-feedback` label. Uses `GITHUB_FEEDBACK_TOKEN` and `GITHUB_FEEDBACK_REPO` env vars.
- `src/components/feedback/actions.ts` — Simplified: removed MP-specific fields (contactId, mpUserId, config.feedbackTypeId, date formatting). Added `pageUrl` parameter. Gets user name from `session.user.name`.
- `src/components/feedback/feedback-button.tsx` — Added `usePathname()` to capture current page URL, passes full URL (origin + pathname) to `submitFeedback`. Updated dialog description text.
- `src/lib/feedback-config-types.ts` — Simplified `FeedbackConfig` to just `{ enabled: boolean }`. Removed `feedbackTypeId` and `assignedToContactId`.
- `src/lib/feedback-config.ts` — Updated `isFeedbackEnabled()` to check `config.enabled && !!process.env.GITHUB_FEEDBACK_TOKEN`. Removed MP-specific default config fields.
- `src/components/admin/feedback/feedback-settings.tsx` — Removed "Ministry Platform Settings" fieldset (feedback type dropdown, assigned contact input). Added "GitHub Integration" fieldset showing token configuration status.
- `src/components/admin/feedback/actions.ts` — Removed `getFeedbackTypes()` MP query. Added `getGitHubTokenConfigured()`. Simplified `saveFeedbackConfigAction` (no feedbackTypeId required check).
- `data/feedback-config.json` — Simplified to `{ "enabled": true }`.
- `.env.example` — Added `GITHUB_FEEDBACK_TOKEN` and `GITHUB_FEEDBACK_REPO` env vars with documentation.
- `README.md` — Updated feedback and FeedbackService descriptions.

**Files unchanged (no modifications needed):**
- `src/components/feedback/feedback-wrapper.tsx` — Still checks `feedbackEnabled` from user context
- `src/components/feedback/index.ts` — Barrel exports unchanged
- `src/components/shared-actions/user.ts` — Already calls `isFeedbackEnabled()` which now checks for GitHub token
- `src/contexts/user-context.tsx` — `feedbackEnabled` state unchanged

**Context files updated:**
- `.claude/ideas.md` — Updated #69 description to note GitHub issue replacement
- `.claude/status.md` — Added #104 to recently completed
- `README.md` — Updated feedback descriptions

**Key decisions:**
- Used GitHub REST API with `fetch()` directly — no new npm dependency needed
- Kept the admin enable/disable toggle + requires `GITHUB_FEEDBACK_TOKEN` env var (both must be true)
- Added `user-feedback` label to all created issues for easy filtering
- Issue body format: description (if provided), then separator, then page URL and submitter name
- `getInstance()` changed from `async` to sync since no MPHelper initialization needed

### Stale-While-Revalidate for Cache Functions ✅ COMPLETED

Added `stale` parameter to all `cacheLife()` calls so expired cache entries continue to be served instantly while fresh data is recomputed in the background. Previously, when the 6-hour revalidate TTL expired, the next user request would hit a cold cache and wait for the full API query.

**Files modified:**
- `src/components/dashboard/cached-data.ts` — Added `stale: 86400` (24h) to all 4 dashboard cache functions
- `src/components/contact-lookup/cached-contacts.ts` — Added `stale: 86400` (24h)
- `src/services/dashboardService.ts` — Added `stale: 172800` (48h) to `getCachedGroupTypes`
- `src/lib/cache-warming.ts` — Updated comment table with Revalidate/Stale columns
- `CLAUDE.md` — Updated cached functions table with Revalidate/Stale columns, added stale-while-revalidate explanation

### Scheduled Daily Cache Re-Warming at 6 AM CT ✅ COMPLETED

Added a daily scheduled cache re-warm so caches are always fresh before users arrive. The `scheduleDailyWarm()` function in `instrumentation.ts` calculates the delay to the next 6:00 AM Central Time, fires a one-shot timer, then repeats every 24 hours via `setInterval`. Reuses the existing `/api/cache-warm` endpoint and token.

**Files modified:**
- `src/instrumentation.ts` — Added `scheduleDailyWarm()` function with CT timezone calculation, called from `register()`
- `CLAUDE.md` — Updated Cache Warming section to document daily 6 AM CT schedule

### Dashboard Chart Improvements (branch: `fix/dashboard-chart-descriptions`) ⚠️ IN PROGRESS

Improving executive dashboard charts: data accuracy, descriptions, and year-over-year comparisons in single-month (weekly) views.

**Changes in this session:**
1. Removed Unique Event Participants KPI card from dashboard metrics (UI only, underlying data kept)
2. Changed Community Attendance total chart to count unique Participant_IDs (deduped across groups) instead of summing per-group attendance
3. Changed label wording from "unique participants" to "unique individuals"
4. Added previous-year comparison to single-month (weekly) views for both Worship Service Attendance and Community Attendance charts
5. Interleaved dates from both years on same x-axis sorted by MM-DD, with solid/dashed lines
6. Fixed duplicate x-axis entries when both years share the same day-of-month — entries now merge into a single point

**Files modified:**
- `src/components/dashboard/dashboard-metrics.tsx` — Removed Unique Event Participants card, updated descriptions
- `src/lib/dto/dashboard.ts` — Added `uniqueParticipants: number` to `CommunityAttendanceTrend`
- `src/services/dashboardService.ts` — Added `Participant_ID` tracking, deduplication per month/week
- `src/components/dashboard/community-total-attendance-chart.tsx` — Rewrote to use `uniqueParticipants`, added weekly YoY comparison with MM-DD merge
- `src/components/dashboard/attendance-chart.tsx` — Added weekly YoY comparison with MM-DD merge, `connectNulls`, dynamic labels
- `CLAUDE.md` — Documented "Year-over-Year Weekly Comparison" pattern in Chart Formatting Standards

**Key decisions:**
- Sort by `date.slice(5)` (MM-DD only) to interleave dates from both years
- Use a Map keyed by MM-DD to merge same-day entries into single x-axis points
- `connectNulls` on all lines so each year's line draws through gaps where only the other year has data
