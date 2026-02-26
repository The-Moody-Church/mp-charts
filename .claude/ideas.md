# Future Features & Improvements

Ideas and enhancements for the MPNext project. This file syncs bidirectionally with [GitHub Issues](https://github.com/The-Moody-Church/mp-charts/issues) — edit freely during sessions, and changes are synced on push to main.

<!-- sync-issues-to-ideas: bidirectional sync enabled -->
<!-- Entries with ([#N](url)) are linked to issues. New entries without a link get issues created automatically on push. -->
<!-- Mark completed: ### ~~Title ([#N](url))~~ ✅ COMPLETED -->

## Table of Contents

### Features
- [Pastoral Interface for Contact Logs (#19)](#pastoral-interface-for-contact-logs-19)
- ~~[Processing Search Bar (#49)](#processing-search-bar-49)~~ ✅
- ~~[Volunteer Processing: Show In-Process Volunteers on Active Tab (#50)](#volunteer-processing-show-in-process-volunteers-on-active-tab-50)~~ ✅
- ~~[Redesign Dashboard Layout: Discipleship Pathway Sections (#42)](#redesign-dashboard-layout-discipleship-pathway-sections-42)~~ ✅
- ~~[Baptism Processing (#17)](#baptism-processing-17)~~ ✅
- ~~[Membership Applications (#47)](#membership-applications-47)~~ ✅
- ~~[Volunteer Processing (#18)](#volunteer-processing-18)~~ ✅
- ~~[Volunteer Processing: Shareable Direct Links to Volunteer Modal (#24)](#volunteer-processing-shareable-direct-links-to-volunteer-modal-24)~~ ✅
- ~~[Volunteer Processing: Assign to Group on Approval (#25)](#volunteer-processing-assign-to-group-on-approval-25)~~ ✅
- ~~[Add current groups list to volunteers already in a group (#36)](#add-current-groups-list-to-volunteers-already-in-a-group-36)~~ ✅

### Improvements
- [Small Group Trends Chart (#15)](#small-group-trends-chart-15)
- ~~[Executive Dashboard: Mobile Views (#13)](#executive-dashboard-mobile-views-13)~~ ✅
- ~~[Volunteer Processing Mobile Views (#33)](#volunteer-processing-mobile-views-33)~~ ✅
- ~~[Executive Dashboard One Month Charts Fix (#12)](#executive-dashboard-one-month-charts-fix-12)~~ ✅
- ~~[Hide Unused Modules in Production (#6)](#hide-unused-modules-in-production-6)~~ ✅
- ~~[Update Webpage Title (#4)](#update-webpage-title-4)~~ ✅
- ~~[Dashboard Date Range Selector (#20)](#dashboard-date-range-selector-20)~~ ✅

### Technical Debt
- [BUG: Active Communities and Small Groups Chart Needs Work (#52)](#bug-active-communities-and-small-groups-chart-needs-work-52)
- ~~[BUG: Baptism Counter Doesn't Respond to Date Range Changes (#51)](#bug-baptism-counter-doesnt-respond-to-date-range-changes-51)~~ ✅
- [IDOR Mitigation — Per-Record Authorization (#57)](#idor-mitigation-per-record-authorization-57)
- [Role-Based Access Control (RBAC) (#58)](#role-based-access-control-rbac-58)
- ~~[Extract Shared Processing Components (Person Card, Milestone Checklist, Detail Modal) (#60)](#extract-shared-processing-components-person-card-milestone-checklist-detail-modal-60)~~ ✅
- ~~[Migrate `unstable_cache` to Cache Components (`use cache`) (#21)](#migrate-unstable_cache-to-cache-components-use-cache-21)~~ ✅
- ~~[review upstream pr42 (#35)](#review-upstream-pr42-35)~~ ✅
- ~~[Upgrade to Next.js 16](#upgrade-to-nextjs-16)~~ ✅
- ~~[Refine MP Permissions (#7)](#refine-mp-permissions-7)~~ ✅
- ~~[Migrate `middleware.ts` to `proxy.ts` (#22)](#migrate-middlewarets-to-proxyts-22)~~ ✅
- ~~[BUG: No Volunteers in Production Builds (#27)](#bug-no-volunteers-in-production-builds-27)~~ ✅
- ~~[Images are not showing on the volunteers. Perhaps a permssions issue? (#30)](#images-are-not-showing-on-the-volunteers-perhaps-a-permssions-issue-30)~~ ✅
- ~~[Links to MP are not showing in production in the volunteer processing pages. (#31)](#links-to-mp-are-not-showing-in-production-in-the-volunteer-processing-pages-31)~~ ✅
- ~~[Review upstream pr 39 (#34)](#review-upstream-pr-39-34)~~ ✅

---

## Features

### Pastoral Interface for Contact Logs ([#19](https://github.com/The-Moody-Church/mp-charts/issues/19))
A dedicated pastoral interface for viewing and managing contact logs.

### ~~Processing Search Bar ([#49](https://github.com/The-Moody-Church/mp-charts/issues/49))~~ ✅ COMPLETED
Added a shared `ProcessingSearchBar` component to all processing pages (volunteer, baptism, membership). Filters cards by name (first name, nickname, last name) across all tabs. Implemented as a reusable component in `src/components/processing/` with a `filterByName` utility in `src/lib/processing-utils.ts`.

### ~~Volunteer Processing: Show In-Process Volunteers on Active Tab ([#50](https://github.com/The-Moody-Church/mp-charts/issues/50))~~ ✅ COMPLETED
Removed the exclusionary group filter in `volunteerService.ts` that prevented in-process volunteers from appearing on the approved tab. Volunteers who are in the processing group AND an active ministry group now appear on both tabs.

### ~~Redesign Dashboard Layout: Discipleship Pathway Sections ([#42](https://github.com/The-Moody-Church/mp-charts/issues/42))~~ ✅ COMPLETED
Redesign the executive dashboard from a flat chart grid into a structured layout organized around four discipleship pathway sections — **Know God**, **Feed Your Soul**, **Grow in Love**, **Change Your World** — plus an **Other** section. Add a 3-circle **Venn diagram** at the top showing engagement overlap (Any Activity ∩ Small Group/Community ∩ Serving/Leading) with person counts in all 7 intersection regions.

**Know God**: Worship attendance (existing), baptisms (existing), membership milestone (new), unique event participants (new). **Feed Your Soul**: Community attendance (existing), small group trends (existing), group participation (existing), roster vs actual attendance (new). **Grow in Love**: Total serving/leading count (new), serving by role type (new), where people serve by ministry (new), serving trends (new). **Change Your World**: Program giving from Donation_Distributions (new), giving trends (new) — will expand with future survey data. **Other**: Year-over-year comparison and anything that doesn't fit.

Full specification with data sources, MP schema relationships, phased implementation plan, and layout wireframe: [`.claude/draft-issue-dashboard-redesign.md`](draft-issue-dashboard-redesign.md)

### ~~Baptism Processing ([#17](https://github.com/The-Moody-Church/mp-charts/issues/17))~~ ✅ COMPLETED
A dedicated interface for tracking and managing the baptism journey/process in Ministry Platform. Mirrors the volunteer processing pattern but simplified — purely milestone-based with 9 ordered steps.

**Implementation plan**: [`.claude/plan-baptism-processing.md`](plan-baptism-processing.md)

**Groups**: Current Applicants (Group 1023) / Paused Applicants (Group 1024)

**9 milestones in order**: Application (26) → Confirmation Email (41) → Interview Scheduled (39) → Interview Completed (25) → Approved (38) → Info Request Email (37) → Items Received (36) → Baptism Scheduled (35) → Baptism capstone (3). Special: Paused (40).

**Key features**: Two-tab interface (current/paused), card grid with photo + checklist, detail modal with contact info (email/phone), approval/pause decision after interview, certificate PDF upload on capstone, deep linking (`?applicant=123`).

**Config**: Program_ID 306, Group_Role_ID 2, all milestone IDs via env vars. Production-visible from day one.

### ~~Membership Applications ([#47](https://github.com/The-Moody-Church/mp-charts/issues/47))~~ ✅ COMPLETED
A dedicated interface for tracking and managing church membership applications. Simplest of the three processing features — single group (1025), purely milestone-based, no tabs.

**Implementation plan**: [`.claude/plan-membership-processing.md`](plan-membership-processing.md)

**Group**: Membership Applicants (Group 1025) — single list, no tabs

**8 milestones in order**: Pre-Application (27) → Application (42) → Started Class (43) → Completed Class (44) → Approved by LC (45) → Listed in Bulletin (46) → Presented to Congregation (47) → Registered Member (48). Excluded: Dropped Membership (49) — managed in MP.

**Key features**: Single-page card grid with photos + checklist, detail modal with contact info (email/phone), file uploads on milestones, photo upload, "Complete Membership" action (creates milestone 48 + ends group participation), deep linking (`?applicant=123`).

**Config**: Program_ID 307, Group_Role_ID 2, all milestone IDs via env vars. Production-visible from day one.

### ~~Volunteer Processing ([#18](https://github.com/The-Moody-Church/mp-charts/issues/18))~~ ✅ COMPLETED
Volunteer processing interface for children's ministry with two-tab layout (New Volunteers In Process / Approved Active Volunteers), card-based display with photos and requirement checklists, detail modal with expanded statuses and MP links, and write-back capabilities for milestones, certifications, and file uploads.

Sub-features delivered: Final Director Approval milestone (star icon, presumed_complete logic), Elder Approved Teacher milestone (blue cap icon), shareable direct links (#24), assign to group on approval (#25), group names on approved cards (#36).

### ~~Volunteer Processing: Shareable Direct Links to Volunteer Modal ([#24](https://github.com/The-Moody-Church/mp-charts/issues/24))~~ ✅ COMPLETED
Add a URL-based deep link to open a specific volunteer's detail modal directly (e.g., `/volunteer-processing?volunteer=123`). This lets staff share a link to a specific volunteer's record with another staff person without them having to search for the card.

### ~~Volunteer Processing: Assign to Group on Approval ([#25](https://github.com/The-Moody-Church/mp-charts/issues/25))~~ ✅ COMPLETED
On the "New Volunteers In Process" tab, when a volunteer receives the fully approved star, add an "Assign to Group" button that reassigns their `Group_Participant` record from the volunteer-in-processing group to an active ministry group. The group picker should use the same list of groups available on the "Approved Active Volunteers" tab.

### ~~Add current groups list to volunteers already in a group ([#36](https://github.com/The-Moody-Church/mp-charts/issues/36))~~ ✅ COMPLETED
On the active volunteers tab of volunteer processing, on an individuals card, list the groups where they have a role that we are tracking.

---

## Improvements

### ~~Executive Dashboard: Mobile Views ([#13](https://github.com/The-Moody-Church/mp-charts/issues/13))~~ ✅ COMPLETED
Comprehensive mobile support added: responsive chart margins, click-triggered tooltips on touch devices, expandable chart wrapper, hidden legends on mobile, viewport-aware tooltip widths, and touch-friendly dismiss behavior.

### Small Group Trends Chart ([#15](https://github.com/The-Moody-Church/mp-charts/issues/15))
The Small Group Trends line chart may not be the best visualization for this data. Consider switching to a bar chart or removing it entirely if it doesn't add enough value to the dashboard.

### ~~Volunteer Processing Mobile Views  ([#33](https://github.com/The-Moody-Church/mp-charts/issues/33))~~ ✅ COMPLETED
Fixed responsive dialog width (`w-[calc(100vw-1rem)] sm:max-w-2xl`), form layouts adapt to screen size, proper select sizing for touch targets.

### ~~Executive Dashboard One Month Charts Fix ([#12](https://github.com/The-Moody-Church/mp-charts/issues/12))~~ ✅ COMPLETED
When only one month of data is selected on the executive dashboard, charts that normally show monthly averages should instead show individual data points. For example, if February is selected, the service attendance chart should show the four data points for February on their dates instead of a single average data point. This applies to all charts that show monthly averages.

### ~~Hide Unused Modules in Production ([#6](https://github.com/The-Moody-Church/mp-charts/issues/6))~~ ✅ COMPLETED
Contact Lookup and Template Tool are gated behind `isDev` in sidebar and home page. Routes still exist but are not linked from the UI in production.

### ~~Update Webpage Title ([#4](https://github.com/The-Moody-Church/mp-charts/issues/4))~~ ✅ COMPLETED
Renamed from "Pastor App" to "MP Tools" in page title, metadata, and all default fallbacks.

### ~~Dashboard Date Range Selector ([#20](https://github.com/The-Moody-Church/mp-charts/issues/20))~~ ✅ COMPLETED
Replace the hardcoded ministry year date ranges with an interactive date selector that includes comparison capabilities.

- **Two-row filter layout**:
  - **Top row (months)**: Preceding months going back in time on the left, current month button on the right
  - **Bottom row (years)**: Year buttons for selection
- **Multi-select**: Hold Ctrl/Cmd to select multiple months or years
- **Quick button**: "Ministry Year" preset (Sep–May)
- **Compare toggle**: Checkbox to compare against the previous period
  - Previous period = same selected date range but shifted back one year
  - Must handle ranges that span multiple years (e.g., Sep 2024–May 2025 compares to Sep 2023–May 2024)

---

## Technical Debt

### ~~BUG: Baptism Counter Doesn't Respond to Date Range Changes ([#51](https://github.com/The-Moody-Church/mp-charts/issues/51))~~ ✅ COMPLETED
Baptism counter now properly responds to date range changes via `countDatesInRange()` in `filterDashboardData()`. The filtered data flows through `DashboardShell` → `useMemo` recompute → `MetricCard` display.

### BUG: Active Communities and Small Groups Chart Needs Work ([#52](https://github.com/The-Moody-Church/mp-charts/issues/52))
The active communities and small groups chart on the executive dashboard needs improvement. The data or visualization is not accurately representing the information.

### IDOR Mitigation — Per-Record Authorization ([#57](https://github.com/The-Moody-Church/mp-charts/issues/57))
Server actions accept record IDs from clients (contactId, participantId, etc.) and only check session presence — not whether the requesting user should access that specific record. An authenticated user could enumerate IDs to access any contact's details, volunteer background check data, or membership information.

**Options to evaluate:**
1. **Per-user access tokens**: Use the user's OIDC access token instead of client credentials so Ministry Platform enforces its own security model per-user. Requires token refresh logic and per-user MPHelper instances.
2. **Relationship checks**: Verify the requesting user's relationship to the record (e.g., are they a group leader for this volunteer's group?).
3. **Audit logging** (interim): Log user ID + accessed record IDs for abuse detection while a proper authorization model is designed.

From security audit finding #10 (2026-02-24).

### Role-Based Access Control (RBAC) ([#58](https://github.com/The-Moody-Church/mp-charts/issues/58))
All authenticated users currently have identical access to all features and data. The proxy only checks session cookie presence, not roles. Any church member with MP OAuth access can view volunteer background checks, baptism applicant data, membership records, and the executive dashboard.

**Options to evaluate:**
1. **MP Security Groups**: Check the user's Ministry Platform security groups at login, store group memberships in the session, and gate features accordingly (e.g., only "Volunteer Coordinators" group can access volunteer processing).
2. **Page-level authorization**: Add role checks in server actions before data access.
3. **Leverage `$userId` more**: Use access-token-based MPHelper instances so MP's built-in permission model governs data access transparently.

From security audit finding #13 (2026-02-24).

### ~~Extract Shared Processing Components (Person Card, Milestone Checklist, Detail Modal) ([#60](https://github.com/The-Moody-Church/mp-charts/issues/60))~~ ✅ COMPLETED
The volunteer processing, baptism processing, and membership processing features share very similar UI patterns — person cards with photos, milestone checklists with show/edit states, detail modals with contact info and action buttons, file upload controls, and deep linking. Currently each feature has its own implementation of these patterns. These should be extracted into shared, reusable components in `src/components/shared/` (or similar) so that:

- **Person card**: A single card component accepting a config for which fields to display (photo, name, milestone progress, group names, etc.), reused across all three processing pages.
- **Milestone checklist**: A generic milestone list component that renders ordered steps with completed/pending states, edit toggles, and write-back actions — configured per feature via milestone definitions.
- **Detail modal**: A shared modal shell with contact info pills (email, phone), photo display, milestone detail view, file upload slots, and action buttons — composed per feature via slots or config.
- **Contact action links**: The bordered pill-style email/phone/link buttons already follow a shared pattern (documented in UI Style Guide) but are copy-pasted per feature.

Consolidating these would reduce duplication, ensure consistent UX across features, and allow updates (e.g., accessibility improvements, mobile fixes) to apply everywhere at once.

### ~~Migrate `unstable_cache` to Cache Components (`use cache`)~~ ✅ COMPLETED (2026-02-23) ([#21](https://github.com/The-Moody-Church/mp-charts/issues/21))
Migrated from `unstable_cache` to `'use cache'` directive with `cacheComponents: true` (full PPR). All 4 call sites converted to `'use cache'` + `cacheLife()` + `cacheTag()`. Added Suspense boundaries to all pages with dynamic data. Dashboard uses `connection()` to defer to runtime. Build output shows `◐ (Partial Prerender)` for all authenticated pages.

### ~~review upstream pr42 ([#35](https://github.com/The-Moody-Church/mp-charts/issues/35))~~ ✅ COMPLETED
Reviewed all upstream PRs through #42 (2026-02-20). Cherry-picked: `@inquirer/prompts` ^7→^8, updated `components.md` layout import patterns, CLAUDE.md additions (Next.js 16 Notes, Services Layer + Contexts, Data Flow, service import patterns).

### ~~Upgrade to Next.js 16~~ ✅ COMPLETED (2026-02-14)
Upgraded from Next.js 15.5.6 to 16.1.6 LTS. See session summary for details.

### ~~Refine MP Permissions ([#7](https://github.com/The-Moody-Church/mp-charts/issues/7))~~ ✅ COMPLETED
Refine Ministry Platform permissions for the application.

**Audit Log User Pass-Through**: When creating records (e.g., `Participant_Milestones` via `createTableRecords`), the `$userId` parameter is passed to the API, but Ministry Platform still records the API client user in the audit log rather than the logged-in user. This needs investigation — the goal is to have the actual logged-in user appear in the MP audit trail for all write operations. Explore whether the MP REST API supports user impersonation or an alternative mechanism for attributing writes to the authenticated user.

### ~~Migrate `middleware.ts` to `proxy.ts` ([#22](https://github.com/The-Moody-Church/mp-charts/issues/22))~~ ✅ COMPLETED
Renamed `middleware.ts` → `proxy.ts` and `middleware.test.ts` → `proxy.test.ts`. Updated exported function from `middleware()` to `proxy()`. The `next-auth/jwt` `getToken` works in both edge and Node.js runtimes — no functional changes needed beyond the rename. Cherry-picked from upstream PR #41.

This has been completed in the upstream repo as pr 41. Merge these changes or duplicate the essential fixes.

### ~~BUG: No Volunteers in Production Builds ([#27](https://github.com/The-Moody-Church/mp-charts/issues/27))~~ ✅ COMPLETED
There are no volunteers showing up in volunteer processing in the production builds. The All volunteers tab is hidden as expecte, but i'm not seeing any volunteers in progress, which i know there is at least one showinng up in dev. At this point, we can expore all the volunteer system to production, no need to keep it dev only any more.

### ~~Images are not showing on the volunteers. Perhaps a permssions issue? ([#30](https://github.com/The-Moody-Church/mp-charts/issues/30))~~ ✅ COMPLETED
Root cause: `NEXT_PUBLIC_*` env vars inlined as `undefined` at Docker build time. Fixed by creating a runtime config context that reads env vars server-side and passes them to client components.

### ~~Links to MP are not showing in production in the volunteer processing pages. ([#31](https://github.com/The-Moody-Church/mp-charts/issues/31))~~ ✅ COMPLETED
Same root cause as #30. Fixed in the same PR.

### ~~Review upstream pr 39 ([#34](https://github.com/The-Moody-Church/mp-charts/issues/34))~~ ✅ COMPLETED
Compare to changes already made in our development and cherrypick individual changes or merge all of appropriate.
