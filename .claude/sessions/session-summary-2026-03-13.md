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
