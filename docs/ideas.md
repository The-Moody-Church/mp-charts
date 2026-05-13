# Future Features & Improvements

Ideas and enhancements for the MPNext project. This file syncs bidirectionally with [GitHub Issues](https://github.com/The-Moody-Church/mp-charts/issues) — edit freely during sessions, and changes are synced on push to main.

<!-- sync-issues-to-ideas: bidirectional sync enabled -->
<!-- Entries with ([#N](url)) are linked to issues. New entries without a link get issues created automatically on push. -->
<!-- Mark completed: ### ~~Title ([#N](url))~~ ✅ COMPLETED -->

## Table of Contents

### Features
- [and more specific dashboard subpages (#72)](#and-more-specific-dashboard-subpages-72)
- ~~[Summer Blast Volunteers](#summer-blast-volunteers)~~ ✅
- ~~[Change feedback to create GitHub issues (#104)](#change-feedback-to-create-github-issues-104)~~ ✅
- ~~[Pastoral Interface for Contact Logs (#19)](#pastoral-interface-for-contact-logs-19)~~ ✅
- ~~[Processing Search Bar (#49)](#processing-search-bar-49)~~ ✅
- ~~[Volunteer Processing: Show In-Process Volunteers on Active Tab (#50)](#volunteer-processing-show-in-process-volunteers-on-active-tab-50)~~ ✅
- ~~[Redesign Dashboard Layout: Discipleship Pathway Sections (#42)](#redesign-dashboard-layout-discipleship-pathway-sections-42)~~ ✅
- ~~[Baptism Processing (#17)](#baptism-processing-17)~~ ✅
- ~~[Membership Applications (#47)](#membership-applications-47)~~ ✅
- ~~[Volunteer Processing (#18)](#volunteer-processing-18)~~ ✅
- ~~[Volunteer Processing: Shareable Direct Links to Volunteer Modal (#24)](#volunteer-processing-shareable-direct-links-to-volunteer-modal-24)~~ ✅
- ~~[Volunteer Processing: Assign to Group on Approval (#25)](#volunteer-processing-assign-to-group-on-approval-25)~~ ✅
- ~~[Add current groups list to volunteers already in a group (#36)](#add-current-groups-list-to-volunteers-already-in-a-group-36)~~ ✅
- ~~[Add feedback feature (#69)](#add-feedback-feature-69)~~ ✅
- ~~[Contact-Lookup badges for Member should specify thpe (#85)](#contact-lookup-badges-for-member-should-specify-thpe-85)~~ ✅

### Improvements
- [Serving metrics: reconcile adult-only vs all-ages counts (#110)](#serving-metrics-reconcile-adult-only-vs-all-ages-counts-110)
- ~~[Card Summaries should have sections (#163)](#card-summaries-should-have-sections-163)~~ ✅
- ~~[see all groups (#162)](#see-all-groups-162)~~ ✅
- ~~[Use Nickname Last name on contact logs (#129)](#use-nickname-last-name-on-contact-logs-129)~~ ✅
- ~~[Auto contact log on action link clicks (#121)](#auto-contact-log-on-action-link-clicks-121)~~ ✅
- ~~[Add "X" to the top right of the contact card (#116)](#add-x-to-the-top-right-of-the-contact-card-116)~~ ✅
- ~~[Small Group Trends Chart (#15)](#small-group-trends-chart-15)~~ ✅
- ~~[contact lookup search improvements (#94)](#contact-lookup-search-improvements-94)~~ ✅
- ~~[membership badge on contact lookup should include date joined (#93)](#membership-badge-on-contact-lookup-should-include-date-joined-93)~~ ✅
- ~~[activity log should exclude group participants (#92)](#activity-log-should-exclude-group-participants-92)~~ ✅
- ~~[Add address to contact lookup contact page. (#88)](#add-address-to-contact-lookup-contact-page-88)~~ ✅
- ~~[Pre-warm Cache on Container Start (#80)](#pre-warm-cache-on-container-start-80)~~ ✅
- ~~[Chart YoY Conparisons (#68)](#chart-yoy-conparisons-68)~~ ✅
- ~~[Executive Dashboard: Mobile Views (#13)](#executive-dashboard-mobile-views-13)~~ ✅
- ~~[Volunteer Processing Mobile Views (#33)](#volunteer-processing-mobile-views-33)~~ ✅
- ~~[Executive Dashboard One Month Charts Fix (#12)](#executive-dashboard-one-month-charts-fix-12)~~ ✅
- ~~[Hide Unused Modules in Production (#6)](#hide-unused-modules-in-production-6)~~ ✅
- ~~[Update Webpage Title (#4)](#update-webpage-title-4)~~ ✅
- ~~[issue description syncing (#73)](#issue-description-syncing-73)~~ ✅
- ~~[Permissions Page: Sort Selected Groups to Top (#70)](#permissions-page-sort-selected-groups-to-top-70)~~ ✅
- ~~[In the Engagement Venn diagram, can we add a circle for overall attendance (in-person + online)? (#67)](#in-the-engagement-venn-diagram-can-we-add-a-circle-for-overall-attendance-in-person-online-67)~~ ✅
- ~~[Dashboard Date Range Selector (#20)](#dashboard-date-range-selector-20)~~ ✅
- ~~[Search should show closer matches first, weighted by field. (#78)](#search-should-show-closer-matches-first-weighted-by-field-78)~~ ✅
- ~~[Reduce Activity Log Query/Cache (#97)](#reduce-activity-log-querycache-97)~~ ✅

### Technical Debt
- [Upgrade TypeScript 5.9 to 6.0 (#136)](#upgrade-typescript-59-to-60-136)
- [~~IDOR Mitigation — Per-Record Authorization ([#57](https://github.com/The-Moody-Church/mp-charts/issues/57))~~ ✅ CLOSED (won't-fix) (#122)](#idor-mitigation-per-record-authorization-57httpsgithubcomthe-moody-churchmp-chartsissues57-closed-wont-fix-122)
- ~~[Photo upload didn't work (#148)](#photo-upload-didnt-work-148)~~ ✅
- ~~[No.cache (#144)](#nocache-144)~~ ✅
- ~~[BUG: Active Communities and Small Groups Chart Needs Work (#52)](#bug-active-communities-and-small-groups-chart-needs-work-52)~~ ✅
- ~~[Executive Dashboard Avg Attendance Broken (#103)](#executive-dashboard-avg-attendance-broken-103)~~ ✅
- ~~[Contact Logs should not be editable unless Made_By = the Current Logged In User (#96)](#contact-logs-should-not-be-editable-unless-made_by-the-current-logged-in-user-96)~~ ✅
- ~~[Contact Lookup Searching Error (#99)](#contact-lookup-searching-error-99)~~ ✅
- ~~[Review Contact Lookup Search Scoring (#98)](#review-contact-lookup-search-scoring-98)~~ ✅
- ~~[Role-Based Access Control (RBAC) (#58)](#role-based-access-control-rbac-58)~~ ✅
- ~~[BUG: Baptism Counter Doesn't Respond to Date Range Changes (#51)](#bug-baptism-counter-doesnt-respond-to-date-range-changes-51)~~ ✅
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
- ~~[No attendance circle one engagement Venn diagram for single month selections. (#83)](#no-attendance-circle-one-engagement-venn-diagram-for-single-month-selections-83)~~ ✅

---

## Features

### and more specific dashboard subpages ([#72](https://github.com/The-Moody-Church/mp-charts/issues/72))
For each step in the journey of a lifetime, add sub pages with more detailed charts.
- Know God
- feed your soul
- grow in love


### ~~Summer Blast Volunteers~~ ✅ COMPLETED
New bespoke route at `/summer-blast-volunteers` for managing the annual Summer Blast event. Two tabs: **Signups** (open Opportunity 85 Responses) and **Volunteers** (active Group 1031 Group_Participants). Cards show CPP / Mandated Reporter / Background Check status with a custom "Will Expire" badge for requirements that are currently valid but expire before 2026-07-31 (the day after the event ends). Click a signup card to add CPP / MR quickly and then "Added to SB Spreadsheet" — which creates a Group_Participant in Group 1031 (using the chosen Group_Role_ID 42-52, or Temp role 1 if none selected) and closes the Response. Tab 2 cards show role-specific requirements (configured per role in `data/summer-blast-config.json`; Temp falls back to BG+CPP+MR) and a "Remove from group" button that end-dates the participant without reopening the Response. Cache-warmed alongside dashboard and contact-search caches.

### ~~Change feedback to create GitHub issues ([#104](https://github.com/The-Moody-Church/mp-charts/issues/104))~~ ✅ COMPLETED
Adjust feedback button to create GitHub issues.

Title required with optional description. Page url where feedback was generated should be appended to the end of the description along with the Name of the logged in user.

This should replace the feedback to MP.

### ~~Pastoral Interface for Contact Logs ([#19](https://github.com/The-Moody-Church/mp-charts/issues/19))~~ ✅ COMPLETED
Contact lookup detail page now serves as the pastoral interface for contact logs. Features: contact info with action buttons (email, phone, SMS), membership/group/serving badges, birthday indicator, collapsible family/household section with avatars, and contact log create/edit functionality. Breadcrumbs show display name instead of GUID.

### ~~Processing Search Bar ([#49](https://github.com/The-Moody-Church/mp-charts/issues/49))~~ ✅ COMPLETED
Added a shared `ProcessingSearchBar` component to all processing pages (volunteer, baptism, membership). Filters cards by name (first name, nickname, last name) across all tabs. Implemented as a reusable component in `src/components/processing/` with a `filterByName` utility in `src/lib/processing-utils.ts`.

### ~~Volunteer Processing: Show In-Process Volunteers on Active Tab ([#50](https://github.com/The-Moody-Church/mp-charts/issues/50))~~ ✅ COMPLETED
Removed the exclusionary group filter in `volunteerService.ts` that prevented in-process volunteers from appearing on the approved tab. Volunteers who are in the processing group AND an active ministry group now appear on both tabs.

### ~~Redesign Dashboard Layout: Discipleship Pathway Sections ([#42](https://github.com/The-Moody-Church/mp-charts/issues/42))~~ ✅ COMPLETED
Redesign the executive dashboard from a flat chart grid into a structured layout organized around four discipleship pathway sections — **Know God**, **Feed Your Soul**, **Grow in Love**, **Change Your World** — plus an **Other** section. Add a 3-circle **Venn diagram** at the top showing engagement overlap (Any Activity ∩ Small Group/Community ∩ Serving/Leading) with person counts in all 7 intersection regions.

**Know God**: Worship attendance (existing), baptisms (existing), membership milestone (new), unique event participants (new). **Feed Your Soul**: Community attendance (existing), small group trends (existing), group participation (existing), roster vs actual attendance (new). **Grow in Love**: Total serving/leading count (new), serving by role type (new), where people serve by ministry (new), serving trends (new). **Change Your World**: Program giving from Donation_Distributions (new), giving trends (new) — will expand with future survey data. **Other**: Year-over-year comparison and anything that doesn't fit.

Full specification with data sources, MP schema relationships, phased implementation plan, and layout wireframe: [`.claude/plans/draft-issue-dashboard-redesign.md`](plans/draft-issue-dashboard-redesign.md)

### ~~Baptism Processing ([#17](https://github.com/The-Moody-Church/mp-charts/issues/17))~~ ✅ COMPLETED
A dedicated interface for tracking and managing the baptism journey/process in Ministry Platform. Mirrors the volunteer processing pattern but simplified — purely milestone-based with 9 ordered steps.

**Implementation plan**: [`.claude/plans/plan-baptism-processing.md`](plans/plan-baptism-processing.md)

**Groups**: Current Applicants (Group 1023) / Paused Applicants (Group 1024)

**9 milestones in order**: Application (26) → Confirmation Email (41) → Interview Scheduled (39) → Interview Completed (25) → Approved (38) → Info Request Email (37) → Items Received (36) → Baptism Scheduled (35) → Baptism capstone (3). Special: Paused (40).

**Key features**: Two-tab interface (current/paused), card grid with photo + checklist, detail modal with contact info (email/phone), approval/pause decision after interview, certificate PDF upload on capstone, deep linking (`?applicant=123`).

**Config**: Program_ID 306, Group_Role_ID 2, all milestone IDs via env vars. Production-visible from day one.

### ~~Membership Applications ([#47](https://github.com/The-Moody-Church/mp-charts/issues/47))~~ ✅ COMPLETED
A dedicated interface for tracking and managing church membership applications. Simplest of the three processing features — single group (1025), purely milestone-based, no tabs.

**Implementation plan**: [`.claude/plans/plan-membership-processing.md`](plans/plan-membership-processing.md)

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

### ~~Add feedback feature ([#69](https://github.com/The-Moody-Church/mp-charts/issues/69))~~ ✅ COMPLETED
Added a floating feedback button and modal allowing authenticated users to submit feedback. Originally created MP Feedback_Entries records; replaced with GitHub issue creation in #104.

### ~~Contact-Lookup badges for Member should specify thpe ([#85](https://github.com/The-Moody-Church/mp-charts/issues/85))~~ ✅ COMPLETED
Extracted `statusBadgeColor` to shared utility (`src/lib/contact-badge-utils.ts`), added member status badges to contact search results, and consolidated duplicate badge color functions from 3 files. Badges now show the specific MP membership type (e.g., "Registered Member", "Associate Member") in both search results and detail pages.

---

## Improvements

### Serving metrics: reconcile adult-only vs all-ages counts ([#110](https://github.com/The-Moody-Church/mp-charts/issues/110))
The Engagement Overview Venn diagram filters serving/leading to **adults only** (18+ or unknown birthdate), showing ~830. The Grow in Love section's "Serving by Role Type" counts **all ages**, showing ~1,022. The ~192-person gap is minors with active serving/leading roles (e.g., student volunteers). Need to decide: should the Grow in Love charts also filter to adults, or should the Venn diagram include all ages? Or add an "(all ages)" note to the Grow in Love description to make the difference explicit?

### ~~Card Summaries should have sections ([#163](https://github.com/The-Moody-Church/mp-charts/issues/163))~~ ✅ COMPLETED
Compliance cards now split the checklist into "Requirements" and "Milestones" sections with small uppercase headers, mirroring the section structure already in the detail modal. Tools without journey milestones (e.g., active-teachers-and-volunteers) keep the original single-list layout. Filed from the `/compliance/stillson-residents` page.

### ~~see all groups ([#162](https://github.com/The-Moody-Church/mp-charts/issues/162))~~ ✅ COMPLETED
Added a "Groups" section to the contact lookup detail page that lists every active Group_Participant for the contact (Group Name, Type, Role, Joined date). The "In a Group" and "Serving" badges are now buttons that toggle the section open and lazy-load the data. Wired through `ContactService.getContactGroupMemberships`, the `getContactGroups` server action, and a new `ContactGroupMembership` DTO.

### ~~Use Nickname Last name on contact logs ([#129](https://github.com/The-Moody-Church/mp-charts/issues/129))~~ ✅ COMPLETED
Auto-created contact logs now use the user's MP Contact Nickname (e.g., "Jonny Huff") instead of the formal OIDC given_name (e.g., "Jonathon Huff"). The nickname is fetched from the Contact record during login and stored in the session. Also fixed contact log dates to convert to Central Time in the service layer (was using server-local UTC in Docker).

### ~~Auto contact log on action link clicks ([#121](https://github.com/The-Moody-Church/mp-charts/issues/121))~~ ✅ COMPLETED
Clicking email, phone, text, or directions links — or copying email, phone, or address — on the contact card automatically creates a Contact Log entry. Maps to Contact Log Types: E-mail (5), Phone Call (1), Text Message (3), Meeting (4). Fire-and-forget: never blocks the user's action.

### ~~Add "X" to the top right of the contact card ([#116](https://github.com/The-Moody-Church/mp-charts/issues/116))~~ ✅ COMPLETED
When viewing contact details, added an "X" close button to the top right of the contact card that returns the user to the search page.

### ~~Small Group Trends Chart ([#15](https://github.com/The-Moody-Church/mp-charts/issues/15))~~ ✅ COMPLETED

### ~~contact lookup search improvements ([#94](https://github.com/The-Moody-Church/mp-charts/issues/94))~~ ✅ COMPLETED
Added helper text ("Search by name, email, or phone number"), clear X button in search box, and mixed-type search: digits-only words search phone, @ words search email, others search name fields. All parts must match (e.g., "Huff 8128" matches name + phone).

### ~~membership badge on contact lookup should include date joined ([#93](https://github.com/The-Moody-Church/mp-charts/issues/93))~~ ✅ COMPLETED
Membership badge now shows Date_Joined for Registered/Associate/Youth Members and the Dropped milestone (ID 49) date for dropped members. Also updated badge colors: Associate/Youth = amber, Serving = emerald (same as "In a Group").

### ~~activity log should exclude group participants ([#92](https://github.com/The-Moody-Church/mp-charts/issues/92))~~ ✅ COMPLETED
Last Activity badge now excludes Group Participants (Page_ID 316) from Activity_Log query.
The Small Group Trends line chart may not be the best visualization for this data. Consider switching to a bar chart or removing it entirely if it doesn’t add enough value to the dashboard.

### ~~Add address to contact lookup contact page. ([#88](https://github.com/The-Moody-Church/mp-charts/issues/88))~~ ✅ COMPLETED
Added address display (line 1, line 2, city/state/zip) and platform-aware "Get Directions" button to the contact lookup detail page. Address fetched via Household → Address chained JOIN. Unlisted addresses show a privacy note. Directions open Apple Maps on iOS, system app picker on Android (geo: scheme), and Google Maps web on desktop.

### ~~Pre-warm Cache on Container Start ([#80](https://github.com/The-Moody-Church/mp-charts/issues/80))~~ ✅ COMPLETED
Implemented automatic cache warming via Next.js `instrumentation.ts` hook + internal API endpoint (`/api/cache-warm`). On server start, the instrumentation hook polls the warming endpoint until ready, then warms all 6 cached functions in parallel (4 dashboard caches + group types + contact search). Protected by `CACHE_WARM_SECRET` env var. Central registry in `src/lib/cache-warming.ts` ensures new cached functions must be registered for warming. CLAUDE.md updated with mandatory steps for adding new cached functions.

### ~~Chart YoY Conparisons ([#68](https://github.com/The-Moody-Church/mp-charts/issues/68))~~ ✅ COMPLETED
Implemented all four enhancements: year filter auto-selects all months, Shift+click month range selection, new Communities’ Attendance total line chart with YoY comparison, and Serving Trends chart with YoY comparison (solid/dashed lines). Reordered Grow in Love section with Communities’ Attendance and Serving Trends first.

### ~~Executive Dashboard: Mobile Views ([#13](https://github.com/The-Moody-Church/mp-charts/issues/13))~~ ✅ COMPLETED
Comprehensive mobile support added: responsive chart margins, click-triggered tooltips on touch devices, expandable chart wrapper, hidden legends on mobile, viewport-aware tooltip widths, and touch-friendly dismiss behavior.

### ~~Volunteer Processing Mobile Views  ([#33](https://github.com/The-Moody-Church/mp-charts/issues/33))~~ ✅ COMPLETED
Fixed responsive dialog width (`w-[calc(100vw-1rem)] sm:max-w-2xl`), form layouts adapt to screen size, proper select sizing for touch targets.

### ~~Executive Dashboard One Month Charts Fix ([#12](https://github.com/The-Moody-Church/mp-charts/issues/12))~~ ✅ COMPLETED
When only one month of data is selected on the executive dashboard, charts that normally show monthly averages should instead show individual data points. For example, if February is selected, the service attendance chart should show the four data points for February on their dates instead of a single average data point. This applies to all charts that show monthly averages.

### ~~Hide Unused Modules in Production ([#6](https://github.com/The-Moody-Church/mp-charts/issues/6))~~ ✅ COMPLETED
Contact Lookup and Template Tool are gated behind `isDev` in sidebar and home page. Routes still exist but are not linked from the UI in production.

### ~~Update Webpage Title ([#4](https://github.com/The-Moody-Church/mp-charts/issues/4))~~ ✅ COMPLETED
Renamed from "Pastor App" to "MP Tools" in page title, metadata, and all default fallbacks.

### ~~issue description syncing ([#73](https://github.com/The-Moody-Church/mp-charts/issues/73))~~ ✅ COMPLETED
The bidirectional sync between ideas.md and GitHub Issues is working correctly. Issue descriptions sync in both directions via the GitHub Actions workflow.

### ~~Permissions Page: Sort Selected Groups to Top ([#70](https://github.com/The-Moody-Church/mp-charts/issues/70))~~ ✅ COMPLETED
Selected groups are now sorted to the top of each group list in the permissions admin. Uses a `Set` for O(1) lookup and stable sort to preserve alphabetical order within selected/unselected groups. Also optimized the checkbox `checked` prop from `Array.includes()` to `Set.has()`.

### ~~In the Engagement Venn diagram, can we add a circle for overall attendance (in-person + online)? ([#67](https://github.com/The-Moody-Church/mp-charts/issues/67))~~ ✅ COMPLETED
Added a dashed emerald/green circle to the engagement Venn diagram showing average total attendance (in-person + online), sized proportionally and centered at the centroid of the three engagement circles. Added an "Avg Sunday Attendance" row to the breakdown table.

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

### ~~Search should show closer matches first, weighted by field. ([#78](https://github.com/The-Moody-Church/mp-charts/issues/78))~~ ✅ COMPLETED
Replaced `filterByName` with `searchByName` that scores and ranks results by match quality: exact (40pts) > starts-with (25pts) > contains (10pts) > Soundex phonetic (1pt) > Levenshtein fuzzy (1pt). Multi-word queries try both "First Last" and "Last First" interpretations; comma-separated queries force "Last, First". Soundex uses first-letter equivalence groups to prevent false positives. Contact lookup uses cached dataset (6h TTL) + client-side scoring with search-as-you-type (300ms debounce). 36 tests.

### ~~Reduce Activity Log Query/Cache ([#97](https://github.com/The-Moody-Church/mp-charts/issues/97))~~ ✅ COMPLETED
Optimized the Activity_Log query for the engagement venn diagram. Replaced single bulk query with per-month parallel queries using `$distinct=true` and `$groupby=Contact_ID`. Added `Page_ID <> 316` filter to exclude Group Participants activity logs (already covered by dedicated Groups dimension).

---

## Technical Debt

### Upgrade TypeScript 5.9 to 6.0 ([#136](https://github.com/The-Moody-Church/mp-charts/issues/136))
Upgrade from TypeScript 5.9.3 to 6.0.x. TS 6.0 is a transition release (last JS-based compiler before TS 7.0 in Go). Main required change: add `"types": ["node"]` to tsconfig.json (default changed from `["*"]` to `[]`). Also simplify lib array, verify `noUncheckedSideEffectImports`. Wait until mid-April 2026 for ecosystem stability across Next.js 16, Zod v4, Vitest, and typescript-eslint.

### ~~IDOR Mitigation — Per-Record Authorization ([#57](https://github.com/The-Moody-Church/mp-charts/issues/57))~~ ✅ CLOSED (won't-fix) ([#122](https://github.com/The-Moody-Church/mp-charts/issues/122))
Closed as not planned. RBAC (feature-level gating by User Group), rate limiting, and staff-only access sufficiently mitigate IDOR risk. All authenticated users are trusted staff with MP accounts — if they have access to a feature, they should have access to all records within it. The same data is accessible directly in Ministry Platform with the same permissions model.

### ~~Photo upload didn't work ([#148](https://github.com/The-Moody-Church/mp-charts/issues/148))~~ ✅ COMPLETED
Next.js server actions default to a 1 MB body size limit. Photo uploads larger than 1 MB hit a 413 error before the server action code executed, causing intermittent "Failed to upload photo" errors (small photos worked, larger ones didn't). Fixed by adding `serverActions.bodySizeLimit: '20mb'` to `next.config.ts` to match the existing 20 MB limit in `processing-utils.ts`.

### ~~No.cache ([#144](https://github.com/The-Moody-Church/mp-charts/issues/144))~~ ✅ COMPLETED
Service-cache singleton was broken by Turbopack chunk splitting — each compiled chunk got its own `ServiceCache` instance. Cache warming populated one instance, but user requests hit a different (empty) one. Fixed by using `globalThis` for the singleton. Also removed verbose MP API logging that was dumping PII to stdout (812K lines/day).

### ~~BUG: Active Communities and Small Groups Chart Needs Work ([#52](https://github.com/The-Moody-Church/mp-charts/issues/52))~~ ✅ COMPLETED
Renamed to "Communities and Groups Trends". Refactored to show active groups by group type (Small Group, Class, Community — Group_Type_ID 1, 3, 11) as a line chart with YoY comparison. Removed participants/averageAttendance from DTO, added groupCountByType breakdown. Added total line and removed Group Participation pie chart.

### ~~Executive Dashboard Avg Attendance Broken ([#103](https://github.com/The-Moody-Church/mp-charts/issues/103))~~ ✅ COMPLETED
The average attendance is broken for periods beyond one month.

The venn diagram doesn't show the circle and the kpi charts for in person and online show 0.

### ~~Contact Logs should not be editable unless Made_By = the Current Logged In User ([#96](https://github.com/The-Moody-Church/mp-charts/issues/96))~~ ✅ COMPLETED
Restricted contact log editing to the creator only. Server-side ownership check in `updateContactLog` verifies `Made_By` matches current user. Edit button hidden for logs created by other users. Also added "Logged by" display showing the contact name of who created each log entry.

### ~~Contact Lookup Searching Error ([#99](https://github.com/The-Moody-Church/mp-charts/issues/99))~~ ✅ COMPLETED
Fixed null safety in `searchByNameFlat` and `searchByName` sort comparators — `Last_Name` and `First_Name` can be null for some contacts in MP, causing `localeCompare` to throw. Added `?? ""` fallback on all four `.localeCompare()` calls.

### ~~Review Contact Lookup Search Scoring ([#98](https://github.com/The-Moody-Church/mp-charts/issues/98))~~ ✅ COMPLETED
Added proportional prefix-match bonus to search scoring: longer prefix matches now score higher than shorter ones (e.g., "Sch" matching "Schmidt" scores more than "S" matching "Schmidt"). Applied to single-word, multi-word first name, and multi-word last name scoring paths. The root cause of "Kent S" not working was actually #99 — null Last_Name contacts crashed the sort before results could be returned.

### ~~Role-Based Access Control (RBAC) ([#58](https://github.com/The-Moody-Church/mp-charts/issues/58))~~ ✅ COMPLETED
Implemented admin-managed feature-to-User-Group mapping with server-action enforcement and client-side UI gating. Features are gated by User Group IDs stored in `data/feature-access.json`, managed via an admin page at `/admin`. Super-admin groups defined in `ADMIN_USER_GROUP_IDS` env var always have full access. Server actions use `requireFeatureAccess(feature)` for enforcement, client-side uses `useAuthorization()` hook to hide inaccessible features from sidebar and home page. Profile data cached 15 minutes with admin flush button. 23 authorization tests + error boundary for "Access Denied" UX.

Implementation plan: [`.claude/plans/plan-rbac.md`](plans/plan-rbac.md)

From security audit finding #13 (2026-02-24).

### ~~BUG: Baptism Counter Doesn't Respond to Date Range Changes ([#51](https://github.com/The-Moody-Church/mp-charts/issues/51))~~ ✅ COMPLETED
Baptism counter now properly responds to date range changes via `countDatesInRange()` in `filterDashboardData()`. The filtered data flows through `DashboardShell` → `useMemo` recompute → `MetricCard` display.

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

### ~~No attendance circle one engagement Venn diagram for single month selections. ([#83](https://github.com/The-Moody-Church/mp-charts/issues/83))~~ ✅ COMPLETED
Fixed: Removed `activeCircles.length > 0` guard so attendance circle shows whenever `averageTotalAttendance > 0`. Also fixed weekly→monthly data conversion to properly compute per-event averages.
