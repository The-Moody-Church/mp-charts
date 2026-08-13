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
- ~~[Summer Blast: surface expired BG/cert when a renewal is in progress](#summer-blast-surface-expired-bgcert-when-a-renewal-is-in-progress)~~ ✅
- ~~[Summer Blast: sort signups by Response_Date (newest first)](#summer-blast-sort-signups-by-response_date-newest-first)~~ ✅
- ~~[Summer Blast: bulk-add signups to spreadsheet](#summer-blast-bulk-add-signups-to-spreadsheet)~~ ✅
- ~~[Summer Blast: pull fresh from MP on every load (remove caching)](#summer-blast-pull-fresh-from-mp-on-every-load-remove-caching)~~ ✅
- ~~[Need to be able to pull in fresh milestones (#171)](#need-to-be-able-to-pull-in-fresh-milestones-171)~~ ✅
- ~~[Add two files at once to a milestone (#170)](#add-two-files-at-once-to-a-milestone-170)~~ ✅
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
- [Server-render the contact detail page's initial read](#server-render-the-contact-detail-pages-initial-read)
- [Member detail modal shows the old photo after upload](#member-detail-modal-shows-the-old-photo-after-upload)
- [Compliance tool editor silently drops orphaned journey config](#compliance-tool-editor-silently-drops-orphaned-journey-config)
- [Blank journey selection reads as ID 0, not null](#blank-journey-selection-reads-as-id-0-not-null)
- [Upgrade TypeScript 5.9 to 6.0 (#136)](#upgrade-typescript-59-to-60-136)
- ~~[Adopt React Compiler lint rules from eslint-plugin-react-hooks 7.1 (#197)](#adopt-react-compiler-lint-rules-from-eslint-plugin-react-hooks-71-197)~~ ✅
- ~~[Dependency security remediation — August 2026](#dependency-security-remediation-august-2026)~~ ✅
- ~~[IDOR Mitigation — Per-Record Authorization (#57)](#idor-mitigation-per-record-authorization-57)~~ ✅
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

### ~~Summer Blast: surface expired BG/cert when a renewal is in progress~~ ✅ COMPLETED
`buildChecklist` now partitions records into active-valid / expired-completed / pending-or-failed and picks status accordingly. Previously, when someone had an expired BG check AND a newer pending one started after it, `.find()` returned the pending one → status fell through to "not_started". Now the same case shows "in_progress" with an inline red "expired" badge (new `previouslyExpired` flag on the DTO). When only an expired record exists with no replacement, status is "expired". CPP form responses also benefit: expired form responses no longer get masked by missing `All_Clear`-style flags.

### ~~Summer Blast: sort signups by Response_Date (newest first)~~ ✅ COMPLETED
Added a "Signup Date (Newest)" sort option, made it the default on the Signups tab. Shared `ProcessingSortOption` extended with `signup-date-desc`; `ProcessingSortSelect` accepts a custom `options` prop so other processing tabs aren't polluted with the new option. The Volunteers tab keeps its existing default sort (Last Name A–Z).

### ~~Summer Blast: bulk-add signups to spreadsheet~~ ✅ COMPLETED
Added per-card checkboxes on the Signups tab and a sticky bulk-action bar that appears when 1+ are selected. "Confirm SB Spreadsheet Addition (Temp role) — N" creates Group_Participants in Group 1031 with Temp role for each selected signup and closes their Opportunity Responses. Partial failures are surfaced inline and the failed cards remain selected for retry; successful ones disappear with the refreshed intake list. Backed by a new `bulkAddToSummerBlast` server action that loops `SummerBlastService.addToSummerBlast` per item so one failure doesn't abort the batch.

### ~~Summer Blast: pull fresh from MP on every load (remove caching)~~ ✅ COMPLETED
Removed the `'use cache'` layer for Summer Blast intake and volunteers — staff need to see real-time signups and current group state without waiting for cache revalidation. `actions.ts` now calls `SummerBlastService` directly; deleted `src/components/summer-blast-volunteers/cached-data.ts`; removed both entries from `cache-warming.ts`.

### ~~Need to be able to pull in fresh milestones ([#171](https://github.com/The-Moody-Church/mp-charts/issues/171))~~ ✅ COMPLETED
Added "Refresh from MP" buttons to the admin Journey Tool editor (Milestones section) and admin Compliance Tool editor (Requirements section and Journey Milestones section). Each button re-fetches the relevant data from Ministry Platform and merges with current in-memory edits — label, visibility, sort order, and other configuration are preserved for milestones/requirements that already existed; newly-added items in MP are appended at the end with default settings.

### ~~Add two files at once to a milestone ([#170](https://github.com/The-Moody-Church/mp-charts/issues/170))~~ ✅ COMPLETED
The shared `QuickActionsPanel` (used by compliance + journey processing to complete a milestone) and `MilestoneEditForm` (used to edit an already-completed milestone) now accept multiple file attachments. Adds the HTML `multiple` attribute and validates each selected file against the 20 MB-per-file limit. Adding additional paperwork to a completed milestone is covered by the existing Edit button on completed records, which now also supports multi-file upload.

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

### Server-render the contact detail page's initial read
`/contact-lookup/[guid]` fetches all five of its MP reads from the client after hydration — contact details, then logs + badges + household + user id in parallel. Moving them into the page's async RSC (behind a small `page-data.ts`) would save a round trip on a daily-use screen and let the data stream with the shell.

Scoped out of the React Compiler remediation (2026-08-12) rather than dropped: retiring the lint warning only needed the client-side loader split, and the server-side move is MED-HIGH on its own terms. Prerequisites, from `.claude/notes/react-compiler-lint-plan.md`:

- **Finding C is settled and it reproduces (verified on TMC1, 2026-08-13).** React re-creates a restored `<Activity>`'s effects but preserves state, so a component seeded from RSC props keeps its stale `useState` value on Back-navigation — only a hard refresh re-runs the RSC. This screen's "Last Activity" badge freshness is load-bearing, so the server-side read is **only** worth doing together with the mount-and-restore effect that both admin grids now use (see `compliance-tools-admin.tsx`). Note the effect must inline its fetch: calling an existing `useCallback` loader from an effect fails `react-hooks/set-state-in-effect` regardless of where its setState sits.
- The page's Suspense fallback needs to become the equivalent spinner block, or the loading UX regresses from a centred spinner to one line of text.
- `page-data.ts` must keep importing the `'use server'` actions so `requireFeatureAccess("contact-lookup")` and `enforceRateLimit(…, "search")` still run on every read — and the PR needs a security-review line confirming the MP call count per page load is unchanged (5).
- `onRefresh` must stay a **full** client reload, never `router.refresh()`.

### Member detail modal shows the old photo after upload
`handlePhotoUpload` in `src/components/manage-members/member-detail-modal.tsx:84` awaits `uploadMemberPhoto`, then calls `onUpdate()` to reload the parent list — but never re-fetches `detail`. The rendered record is `detail?.member ?? member` (line 122), so once `detail` is loaded the modal keeps rendering the **stale** `fileUniqueId` and the old photo stays on screen until the modal is closed and reopened.

Found during the React Compiler remediation and deliberately left reproduced so the refactor stayed behavior-preserving. Fix candidate: re-run `fetchMemberDetail` in the upload's success path, or lift the new image GUID out of the upload action's return value.

### Compliance tool editor silently drops orphaned journey config
Two related cases in `src/components/admin/compliance-tools/compliance-tool-editor.tsx`, both pre-existing and both deliberately preserved by the 2026-08-11 refactor:

- **Orphaned milestones are wiped on open.** A tool saved with `journeyId: null` but a non-empty `journeyMilestones` array loses those milestones the moment the editor mounts, and the next save writes `[]`. The behavior now lives in the `useState` initializer's `existingTool?.journeyId ? … : []` ternary (previously the mount pass of the journey effect). Arguably correct — milestones with no journey can't be written to MP — but it happens with no warning to the admin.
- **`pauseMilestoneId` is never cleared when the journey changes.** Detaching or switching the journey replaces `journeyMilestones` but leaves `pauseMilestoneId` pointing at a milestone that is no longer in the list. The pause-milestone `<select>` is hidden when there's no journey, so the stale ID survives to the save payload unseen.

### Blank journey selection reads as ID 0, not null
`src/components/admin/journey-tools/journey-tool-editor.tsx:309` does `handleJourneySelect(Number(e.target.value))` with no empty-string guard, so choosing the `<option value="">Select a journey...</option>` placeholder sets `selectedJourneyId` to `Number("") === 0` rather than `null`. Every downstream check is falsy-based so nothing breaks today, but the `<select>`'s `value` then matches no option, and any future `!== null` / `??` check on that field would read `0` as a real selection. The compliance editor's equivalent select already guards this correctly (`e.target.value ? Number(...) : null`).

### Upgrade TypeScript 5.9 to 6.0 ([#136](https://github.com/The-Moody-Church/mp-charts/issues/136))
Upgrade from TypeScript 5.9.3 to 6.0.x. TS 6.0 is a transition release (last JS-based compiler before TS 7.0 in Go). Main required change: add `"types": ["node"]` to tsconfig.json (default changed from `["*"]` to `[]`). Also simplify lib array, verify `noUncheckedSideEffectImports`. Wait until mid-April 2026 for ecosystem stability across Next.js 16, Zod v4, Vitest, and typescript-eslint.

### ~~Adopt React Compiler lint rules from eslint-plugin-react-hooks 7.1 ([#197](https://github.com/The-Moody-Church/mp-charts/issues/197))~~ ✅ COMPLETED
`eslint-config-next` 16.3.0 pulls in `eslint-plugin-react-hooks` 7.1, which adds the React Compiler rules `set-state-in-effect`, `immutability` and `incompatible-library`. They flagged 20 pre-existing violations across 17 files — no new code triggered them.

**Progress (2026-08-07):** two of the three rules are done and enforced at `error`:
- `react-hooks/immutability` — the "Active contacts only" toggle re-ran the search from an effect that called `handleSearch` before its `const` declaration. Now runs from the checkbox's `onChange` with a **required** scope parameter, so the type checker catches the stale-value bug the effect existed to dodge.
- `react-hooks/incompatible-library` — `watch()` opted `contact-logs` out of React Compiler optimisation entirely; swapped for `useWatch({ control, name })`.

**All 20 violations are fixed and all three rules are enforced at `error`** (2026-08-12). Full per-site plan, risk ranking, traps and manual test checklist: `.claude/notes/react-compiler-lint-plan.md`.

**Progress (2026-08-11):** both admin tool editors done (plan's PR 2). The journey and compliance milestone-load effects moved into their `<select>` change handlers — separately, because the compliance select isn't `disabled={isEditing}` and its three branches have different semantics (switching back to the saved journey is a staff undo that must restore verbatim with no MP call). A dead no-op effect in the compliance editor was deleted. Three pre-existing bugs found along the way were deliberately reproduced rather than fixed mid-refactor; they are the three entries above.

**Progress (2026-08-11, cont.):** summer-blast done (plan's PR 3) — all four sites in one feature folder. Three decisions ratified and written into the plan note: (1) a modal remount **clears** unsaved form state, which costs nothing in summer-blast but discards `milestoneNotes` / `milestoneDate` / `selectedMilestoneKey` in the processing modals next PR; (2) summer-blast is **Shape 1b**, not Shape 1 — its page fallback is one line of text where the component renders header + tabs + skeleton grid, so the read stays client-side and the real-time Back refresh survives; (3) **Finding C is deferred** to the end-to-end pass, with PRs 5–7 proceeding on the prediction that Back still refetches.

**Progress (2026-08-11, cont.):** both processing families done (plan's PR 4) — six sites, two commits so a revert is per-family. Mount loads split as in summer-blast; the deep-link auto-open folded into the load continuation with the latch as a `useRef` (and a *failed* load no longer burns the link, since it never reaches the continuation); both detail modals reset by remount on a per-open counter, which is where the ratified clear-on-reopen ruling first has teeth. The plan's derived-`loading` state machine for compliance was rejected, as the plan itself concluded once Finding B landed.

**Progress (2026-08-11, cont.):** manage-members done (plan's PR 5). The shell's deep-link site turned out **not** to be a Shape 1 site — the only violation was one synchronous `setHasAutoOpened(true)`, so making the latch a `useRef` retired it with no server-side move and none of the soft-navigation exposure the plan had priced. That also fixed the latch, which as state never held under StrictMode's double-invoke. The detail modal converged on the per-open key idiom. Two sites left: `contact-lookup-details` and `user-context`.

**Progress (2026-08-12):** `contact-lookup-details` done (plan's PR 6) — Shape 1b rather than the planned Shape 1, the third time the plan's shape assignment didn't hold. The plan's real prize, testability, is kept: the household filter+sort moved to `src/lib/household-sort.ts` with 9 tests, out of a `setFamilyMembers()` callback nothing could reach. The deferred server-side read is filed as its own entry above. One site left: `user-context`.

**Done (2026-08-12):** `user-context` landed and `set-state-in-effect` flipped to `error`. Verified enforcement by injecting a violation — lint exits 1.

The plan's Shape 1 (move the read to a Server Component, seed `useState` from props) turned out to be needed at **exactly one** of the six sites it was assigned to: the PR 1 admin exemplar. Corrections B, D and E each found a smaller fix, and `user-context` made four: its two synchronous setState blocks existed only to wipe state back to its initial values, so tagging each load with the `userGuid` it was made for let the whole thing be derived instead. That also removed a real defect — the old provider served the previous user's profile and feature list while the next user's load was in flight.

Because no server-side move happened outside PR 1, Finding C's exposure was limited to the admin tool grids — where it **did** bite. Settled on 2026-08-13: it reproduces, and both grids now re-read on mount and on `<Activity>` restore. The one place it genuinely blocks work is the deferred contact-detail server read, filed separately above.

Three findings from the analysis worth carrying forward:
- **The rule under-approximates.** It walks only an effect's own basic blocks and never descends into nested function expressions, so a loader declared *inside* the effect hides the identical pattern (`contact-logs.tsx:186` was invisible to lint). There is a one-line non-fix at every remaining site — wrap the body in a nested async function and the warning disappears with the pattern intact. Reject any diff whose only structural change is nesting depth.
- **Dynamic segments remount.** `/journey/[slug]` and `/contact-lookup/[guid]` are part of the router cache key, so navigating between records remounts. This retires a proposed hand-rolled loading state machine and closes a suspected `defaultValues` data-integrity bug that turns out to be unreachable.
- **Finding C, unresolved.** `cacheComponents: true` wraps segments in `<Activity mode="hidden">`, and React destroys/recreates hidden effects — so mount fetches currently re-run on Back-navigation. Moving those reads to Server Components seeds `useState`, whose initializers do *not* re-run on Activity restore, which would delete that refresh. Next's `staleTimes.dynamic` defaults to `0` (and `await connection()` makes these routes dynamic), which predicts Back still refetches — but this needs a signed-in browser to confirm and affects the 5 remaining Shape 1 sites.

### ~~Dependency security remediation — August 2026~~ ✅ COMPLETED
Cleared all 17 open Dependabot alerts and unblocked the deploy pipeline, which had been dead since 2026-07-10: `build-scan-and-push` runs `npm audit --audit-level=high` before the Docker build, and it was exiting 1 on 6 high advisories, so no image had been published for 27 days.

Runtime: **next 16.2.6 → 16.3.0** (8 alerts — of those, only GHSA-m99w-x7hq-7vfj / Server Actions DoS is actually exploitable here; the rest need rewrites, i18n locales, a custom server, image optimization, or `fetch(new Request(init), otherInit)`, none of which this app uses). **sharp 0.34.5 → 0.35.3** (libvips CVEs) came free — 16.3.0 pins `sharp ^0.35.3` where 16.2.12 still pins `^0.34.5`, so no override was needed. **postcss → 8.5.26** (note 8.5.18, the version the alert cited, is *not* sufficient — GHSA-fxqj-rqcc-2cmp covers `<=8.5.22`).

Dev-scope, all lockfile-only and absent from the standalone image: undici → 7.29.0, js-yaml → 4.3.1, brace-expansion 1.x → 1.1.18. Also bumped brace-expansion 5.0.7 → 5.0.9: not yet alerted, but the pin added in `8ba3166` for GHSA-jxxr-4gwj-5jf2 had been overtaken (range is now `<=1.1.17 || 4.0.0 - 5.0.8`).

Two things surfaced along the way: Next 16.3.0 widens `next build`'s type-check scope to include test files, exposing 16 latent type errors that were already failing `tsc --noEmit` on main; and `eslint-plugin-react-hooks` 7.1 added rules flagging 19 pre-existing patterns (tracked above).

### ~~IDOR Mitigation — Per-Record Authorization ([#57](https://github.com/The-Moody-Church/mp-charts/issues/57))~~ ✅ COMPLETED
Closed as not planned (tracked to closure in [#122](https://github.com/The-Moody-Church/mp-charts/issues/122)). RBAC (feature-level gating by User Group), rate limiting, and staff-only access sufficiently mitigate IDOR risk. All authenticated users are trusted staff with MP accounts — if they have access to a feature, they should have access to all records within it. The same data is accessible directly in Ministry Platform with the same permissions model.

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
