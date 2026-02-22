# Future Features & Improvements

Ideas and enhancements for the MPNext project. This file syncs bidirectionally with [GitHub Issues](https://github.com/The-Moody-Church/mp-charts/issues) — edit freely during sessions, and changes are synced on push to main.

<!-- sync-issues-to-ideas: bidirectional sync enabled -->
<!-- Entries with ([#N](url)) are linked to issues. New entries without a link get issues created automatically on push. -->
<!-- Mark completed: ### ~~Title ([#N](url))~~ ✅ COMPLETED -->

## Table of Contents

### Features ([#44](https://github.com/The-Moody-Church/mp-charts/issues/44))
- [Redesign Dashboard Layout: Discipleship Pathway Sections (#42)](#redesign-dashboard-layout-discipleship-pathway-sections-42)
- [Baptism Processing (#17)](#baptism-processing-17)
- [Membership Applications](#membership-applications)
- [Pastoral Interface for Contact Logs (#19)](#pastoral-interface-for-contact-logs-19)
- ~~[Volunteer Processing (#18)](#volunteer-processing-18)~~ ✅
- ~~[Shareable Direct Links (#24)](#volunteer-processing-shareable-direct-links-to-volunteer-modal-24)~~ ✅
- ~~[Assign to Group on Approval (#25)](#volunteer-processing-assign-to-group-on-approval-25)~~ ✅
- ~~[Add Current Groups to Volunteer Cards (#36)](#add-current-groups-list-to-volunteers-already-in-a-group-36)~~ ✅

### Improvements ([#45](https://github.com/The-Moody-Church/mp-charts/issues/45))
- [Executive Dashboard: Mobile Views (#13)](#executive-dashboard-mobile-views-13)
- [Small Group Trends Chart (#15)](#small-group-trends-chart-15)
- [Volunteer Processing Mobile Views (#33)](#volunteer-processing-mobile-views-33)
- ~~[Executive Dashboard One Month Charts Fix (#12)](#executive-dashboard-one-month-charts-fix-12)~~ ✅
- ~~[Hide Unused Modules in Production (#6)](#hide-unused-modules-in-production-6)~~ ✅
- ~~[Update Webpage Title (#4)](#update-webpage-title-4)~~ ✅
- ~~[Dashboard Date Range Selector (#20)](#dashboard-date-range-selector-20)~~ ✅

### Technical Debt ([#46](https://github.com/The-Moody-Church/mp-charts/issues/46))
- [Migrate `unstable_cache` to Cache Components (#21)](#migrate-unstable_cache-to-cache-components-use-cache--reverted-2026-02-14-21)
- [Review upstream PR #42 (#35)](#review-upstream-pr42-35)
- ~~[Upgrade to Next.js 16](#upgrade-to-nextjs-16)~~ ✅
- ~~[Refine MP Permissions (#7)](#refine-mp-permissions-7)~~ ✅
- ~~[Migrate `middleware.ts` to `proxy.ts` (#22)](#migrate-middlewarets-to-proxyts-22)~~ ✅
- ~~[BUG: No Volunteers in Production Builds (#27)](#bug-no-volunteers-in-production-builds-27)~~ ✅
- ~~[Images Not Showing on Volunteers (#30)](#images-are-not-showing-on-the-volunteers-perhaps-a-permssions-issue-30)~~ ✅
- ~~[MP Links Not Showing in Production (#31)](#links-to-mp-are-not-showing-in-production-in-the-volunteer-processing-pages-31)~~ ✅
- ~~[Review Upstream PR #39 (#34)](#review-upstream-pr-39-34)~~ ✅

---

## Features

### Redesign Dashboard Layout: Discipleship Pathway Sections ([#42](https://github.com/The-Moody-Church/mp-charts/issues/42))
Redesign the executive dashboard from a flat chart grid into a structured layout organized around four discipleship pathway sections — **Know God**, **Feed Your Soul**, **Grow in Love**, **Change Your World** — plus an **Other** section. Add a 3-circle **Venn diagram** at the top showing engagement overlap (Any Activity ∩ Small Group/Community ∩ Serving/Leading) with person counts in all 7 intersection regions.

**Know God**: Worship attendance (existing), baptisms (existing), membership milestone (new), unique event participants (new). **Feed Your Soul**: Community attendance (existing), small group trends (existing), group participation (existing), roster vs actual attendance (new). **Grow in Love**: Total serving/leading count (new), serving by role type (new), where people serve by ministry (new), serving trends (new). **Change Your World**: Program giving from Donation_Distributions (new), giving trends (new) — will expand with future survey data. **Other**: Year-over-year comparison and anything that doesn't fit.

Full specification with data sources, MP schema relationships, phased implementation plan, and layout wireframe: [`.claude/draft-issue-dashboard-redesign.md`](.claude/draft-issue-dashboard-redesign.md)

### Baptism Processing ([#17](https://github.com/The-Moody-Church/mp-charts/issues/17))
A dedicated interface for tracking and managing the baptism journey/process in Ministry Platform. Mirrors the volunteer processing pattern but simplified — purely milestone-based with 9 ordered steps.

**Implementation plan**: [`.claude/plan-baptism-processing.md`](.claude/plan-baptism-processing.md)

**Groups**: Current Applicants (Group 1023) / Paused Applicants (Group 1024)

**9 milestones in order**: Application (26) → Confirmation Email (41) → Interview Scheduled (39) → Interview Completed (25) → Approved (38) → Info Request Email (37) → Items Received (36) → Baptism Scheduled (35) → Baptism capstone (3). Special: Paused (40).

**Key features**: Two-tab interface (current/paused), card grid with photo + checklist, detail modal with contact info (email/phone), approval/pause decision after interview, certificate PDF upload on capstone, deep linking (`?applicant=123`).

**Config**: Program_ID 306, Group_Role_ID 2, all milestone IDs via env vars. Production-visible from day one.

### Membership Applications ([#47](https://github.com/The-Moody-Church/mp-charts/issues/47))
A dedicated interface for tracking and managing church membership applications. Patterned after the volunteer processing and baptism processing features — milestone-based checklist, card grid with photos, detail modal with contact info and write-back capabilities. Group IDs, milestone IDs, and process steps TBD.

### Pastoral Interface for Contact Logs ([#19](https://github.com/The-Moody-Church/mp-charts/issues/19))
A dedicated pastoral interface for viewing and managing contact logs.

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

### Executive Dashboard: Mobile Views ([#13](https://github.com/The-Moody-Church/mp-charts/issues/13))
The mobile view needs redevelopment. Charts are squeezed and the data overlay when clicking on a data point is unruly and difficult to close. Redevelop and refine the mobile view strategy.

### Small Group Trends Chart ([#15](https://github.com/The-Moody-Church/mp-charts/issues/15))
The Small Group Trends line chart may not be the best visualization for this data. Consider switching to a bar chart or removing it entirely if it doesn't add enough value to the dashboard.

### Volunteer Processing Mobile Views  ([#33](https://github.com/The-Moody-Church/mp-charts/issues/33))
When the modal is opened on a phone, it is wider than the screen. This includes when an item is in edit mode. Open to suggestions on solutions.

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

### Migrate `unstable_cache` to Cache Components (`use cache`) ⚠️ REVERTED (2026-02-14) ([#21](https://github.com/The-Moody-Church/mp-charts/issues/21))
Originally migrated to `'use cache'` directive with `cacheTag` and `cacheLife`, but reverted ([PR #10](https://github.com/The-Moody-Church/mp-charts/pull/10)) because the `'use cache'` directive is only available in Next.js canary builds, not stable releases. The codebase currently uses `unstable_cache`. Revisit when `'use cache'` lands in a stable Next.js release.

### review upstream pr42 ([#35](https://github.com/The-Moody-Church/mp-charts/issues/35))
Review upstream pr 42 for updates and cherry pick changes or merge all features.

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
