# Session Summary — 2026-02-26

## Issues Addressed

### Issue #49: Processing Search Bar — ✅ COMPLETED
Added a shared search bar component across all processing pages (volunteer, baptism, membership). The search filters cards by name (first name, nickname, last name) in real time.

**Files created:**
- `src/components/processing/processing-search-bar.tsx` — Reusable search input with search icon, clear button, responsive width

**Files modified:**
- `src/lib/processing-utils.ts` — Added `filterByName()` generic utility function
- `src/components/processing/index.ts` — Added `ProcessingSearchBar` barrel export
- `src/components/volunteer-processing/volunteer-processing.tsx` — Added search state, `filterByName` via `useMemo`, search bar in tab header row, search-aware empty messages
- `src/components/baptism-processing/baptism-processing.tsx` — Same pattern: search state, filtered lists, search bar, search-aware empty messages
- `src/components/membership-processing/membership-processing.tsx` — Same pattern: search state, filtered list, search bar in header row, search-aware empty messages

### Issue #50: Non-Exclusionary Volunteer Groups — ✅ COMPLETED
Removed the exclusion filter in `volunteerService.ts` that prevented in-process volunteers from appearing on the approved active volunteers tab. Volunteers in both the processing group and an active ministry group now appear on both tabs.

**Files modified:**
- `src/services/volunteerService.ts:221-236` — Removed the `processingGroupIds` exclusion block (16 lines removed). The `filteredParticipants` variable now simply aliases `groupParticipants` without filtering.

### Issues #13, #33, #51 — Confirmed ✅ COMPLETED (previously implemented)
- **#13** (Executive Dashboard Mobile Views): Comprehensive mobile support exists — responsive charts, touch tooltips, expandable chart wrapper
- **#33** (Volunteer Processing Mobile Views): Dialog width responsive (`w-[calc(100vw-1rem)] sm:max-w-2xl`)
- **#51** (Baptism Counter Date Range): Properly implemented via `countDatesInRange()` in `filterDashboardData()`

## Reorganize .claude/ Folder & Update CLAUDE.md

Reorganized `.claude/` into subfolders and rewrote the Memory & Context Management section of CLAUDE.md.

### Folder reorganization:
- **Created** `.claude/sessions/` — moved all 16 session-summary files here
- **Created** `.claude/plans/` — moved `plan-baptism-processing.md`, `plan-membership-processing.md`, `draft-issue-dashboard-redesign.md`
- **Created** `.claude/notes/` — moved `community-attendance-debugging.md`, `security-audit-2026-02-24.md`
- **Created** `.claude/status.md` — lightweight project status snapshot (replaces work-in-progress.md)
- **Removed** `.claude/work-in-progress.md` — redundant with session summaries (715 lines, 90% duplicated content)

### CLAUDE.md changes:
- Rewrote **Memory & Context Management** section with new folder structure, status file description, and streamlined session summary instructions
- Changed session summary approach: write incrementally as you work, then review and polish at session end
- Removed references to `work-in-progress.md` throughout
- Added **Pre-PR Issue & Ideas Sync** section requiring issue/ideas.md check before creating PRs
- Updated security audit path references to new `.claude/notes/` location
- Added `status.md` and security audit to Reference Documents section

### Other files modified:
- `.claude/ideas.md` — Updated 3 plan file links to new `.claude/plans/` paths

---

## Upstream Sync

### PR #50: Load User Roles/Groups into MPUserProfile — Incorporated
- Added `roles: string[]` and `userGroups: string[]` to `MPUserProfile` interface
- Updated `UserService.getUserProfile()` to fetch roles/groups in parallel from `dp_User_Roles` and `dp_User_User_Groups`
- Kept our security improvements (sanitizeGuid, sanitizeIds) that upstream doesn't have
- Changed return type to `MPUserProfile | undefined`
- Created `src/services/userService.test.ts` with 6 tests

### PR #51: Security Vulnerability Fixes — Incorporated
- Resolved 3 CVEs via `npm audit fix` (lockfile-only changes):
  - rollup CVE-2026-27606 (High)
  - minimatch GHSA-3ppc-4f35-3m26 (High)
  - ajv GHSA-2g4f-4pwh-qvx6 (Moderate)

## Issue #58: Role-Based Access Control (RBAC) — ✅ COMPLETED

Full RBAC implementation with admin-managed feature-to-User-Group mapping, server-action enforcement, and client-side UI gating.

### Architecture
- Features gated by User Group IDs stored in `data/feature-access.json`
- Super-admin groups defined in `ADMIN_USER_GROUP_IDS` env var (comma-separated, IN-style)
- Admin page at `/admin` for managing feature-to-group mappings (super-admin only)
- `requireFeatureAccess(feature)` replaces `requireSession()` in all server actions
- `useAuthorization()` hook for client-side UI gating
- Profile data cached 15 minutes with admin flush button
- Error boundary shows "Access Denied" for unauthorized access

### Files created:
- `src/lib/authorization.ts` — Feature type, config loading, hasFeatureAccess, isSuperAdmin, requireFeatureAccess, getAccessibleFeatures
- `src/lib/authorization.test.ts` — 23 tests for authorization logic
- `data/feature-access.json` — Default feature-access config (all allowedGroupIds empty)
- `src/app/(web)/admin/page.tsx` — Admin page route with Suspense wrapper
- `src/components/admin/admin-page.tsx` — Client component with User Group checkboxes per feature + cache flush button
- `src/components/admin/actions.ts` — Server actions: getFeatureAccessConfig, updateFeatureAccess, getAvailableUserGroups, flushProfileCaches
- `src/components/admin/index.ts` — Barrel export
- `src/hooks/use-authorization.ts` — useAuthorization hook (canAccess, isSuperAdmin)
- `src/components/home/home-cards.tsx` — Client component for feature cards with authorization gating
- `src/components/home/index.ts` — Barrel export
- `src/app/(web)/error.tsx` — Error boundary with "Access Denied" UX for forbidden errors

### Files modified:
- `src/lib/providers/ministry-platform/types/user-profile.types.ts` — Added `userGroupIds: number[]`
- `src/services/userService.ts` — Select `User_Group_ID` in groups query, added 15-min profile cache with `flushProfileCache()`
- `src/services/userService.test.ts` — Updated for userGroupIds, added cache and flush tests (8 tests total)
- `src/components/shared-actions/user.ts` — Added `getUserAuthorization()` server action
- `src/contexts/user-context.tsx` — Added `accessibleFeatures` and `isSuperAdmin` to context, loads via `getUserAuthorization()` in parallel with profile
- `src/components/layout/sidebar.tsx` — Nav items now have `feature`/`devOnly`/`adminOnly` properties, filtered by `useAuthorization()`; added "Access Control" link
- `src/app/(web)/page.tsx` — Replaced hardcoded cards with `<HomeCards />` client component
- `.env.example` — Added `ADMIN_USER_GROUP_IDS=29`
- `src/components/dashboard/actions.ts` — All 5 exported functions now use `requireFeatureAccess("dashboard")`
- `src/components/volunteer-processing/actions.ts` — All 14 actions use `requireFeatureAccess("volunteer-processing")`
- `src/components/baptism-processing/actions.ts` — All 10 actions use `requireFeatureAccess("baptism-processing")`
- `src/components/membership-processing/actions.ts` — All 8 actions use `requireFeatureAccess("membership-processing")`
- `src/components/contact-lookup/actions.ts` — Uses `requireFeatureAccess("contact-lookup")`
- `src/components/contact-lookup-details/actions.ts` — Both actions use `requireFeatureAccess("contact-lookup")`
- `src/components/contact-logs/actions.ts` — All 6 actions use `requireFeatureAccess("contact-logs")`
- `.claude/plans/plan-rbac.md` — Status updated to "Implemented"
- `.claude/ideas.md` — #58 marked completed
- `.claude/status.md` — Updated with RBAC completion

## Post-Commit Bugfixes & Improvements

### Bug: Ambiguous column name in User Groups query
The `dp_User_User_Groups` query used bare `User_Group_ID` in the select, which MP's API rejected as ambiguous (exists in both base and joined table). Fixed by qualifying as `User_Group_ID_TABLE.User_Group_ID`.

**File modified:** `src/services/userService.ts:92` — Changed select from `"User_Group_ID, ..."` to `"User_Group_ID_TABLE.User_Group_ID, ..."`

### Bug: Turbopack env var not available in server component renders
`process.env.ADMIN_USER_GROUP_IDS` is `undefined` during server component rendering (GET requests) in Turbopack, though it works in server actions (POST requests). The admin page's server component called `requireFeatureAccess("admin")` during render, which failed because `isSuperAdmin` couldn't read the env var.

**Fix:** Refactored admin page from server-component data fetching to client-side data fetching via `useEffect` → server actions (POST). The `next.config.ts` `env` approach was tried first but didn't work (config evaluates before `.env.local` is loaded).

**Files modified:**
- `src/app/(web)/admin/page.tsx` — Simplified to just render `<AdminPage />` (removed `AdminContent` server component and Suspense wrapper)
- `src/components/admin/admin-page.tsx` — Now fetches data in `useEffect` via `getFeatureAccessConfig()` and `getAvailableUserGroups()` server actions; handles loading/error states inline

### Rename "Access Control" → "Setup"
- `src/components/layout/sidebar.tsx` — Nav item label changed to "Setup"
- `src/components/home/home-cards.tsx` — Card title changed to "Setup", button text to "Open Setup"
- `src/components/admin/admin-page.tsx` — Page heading changed to "Setup"

### Promote Contact Lookup from dev-only to RBAC-gated
- `src/components/layout/sidebar.tsx` — Removed `devOnly: true` from Contact Lookup nav item
- `src/components/home/home-cards.tsx` — Removed `devOnly: true`, updated description and button text

### Add search/filter to Setup page group lists
Each feature card's User Group checkbox list now has a search input ("Filter groups...") that filters by group name or ID. Extracted `FilteredGroupList` component with `useMemo` filtering.

**File modified:** `src/components/admin/admin-page.tsx` — Added `searchTerms` state, `Input` for per-card filtering, `FilteredGroupList` component

### Remove Template Tool and supporting infrastructure
The Template Tool was an artifact from the initial fork — removed entirely along with its shared tool infrastructure (no other consumers).

**Files removed:**
- `src/app/(web)/tools/` — Template Tool route, page, layout
- `src/components/tool/` — ToolContainer, ToolHeader, ToolFooter, ToolParamsDebug, barrel export
- `src/components/user-tools-debug/` — UserToolsDebug component, actions, barrel export
- `src/lib/tool-params.ts` — Tool parameter parsing utilities
- `src/services/toolService.ts` — Tool service singleton

**Files modified:**
- `src/components/layout/sidebar.tsx` — Removed Template Tool nav item, removed `devOnly` property and `isDev` const (no remaining dev-only items)
- `src/components/home/home-cards.tsx` — Removed Template Tool card, removed `devOnly` property and `isDev` const

### Persist feature-access.json in Docker
The `data/` directory wasn't copied into the Docker image, and runtime writes were ephemeral. Fixed by:
1. Adding `COPY --from=builder /app/data ./data` to Dockerfile runner stage (ships defaults)
2. Enabling the `data:/app/data` named volume in docker-compose.yml (persists runtime changes)

**Files modified:**
- `Dockerfile` — Added `COPY --from=builder /app/data ./data` to runner stage
- `docker-compose.yml` — Uncommented volume mount `data:/app/data` and `volumes:` declaration
