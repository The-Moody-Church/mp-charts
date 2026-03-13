# Session Summary — 2026-03-12

## Objective
Address multiple issues: #85 (member badge specificity), #88 (contact address + directions), #83 (Venn diagram attendance circle).

## Work Completed

### Issue #85 — Member Status Badge Specificity ✅ COMPLETED (PR #90)

**Problem**: The contact lookup search results showed no membership badges. The `statusBadgeColor` function was duplicated across 3 files.

**Solution**:
1. Extracted `statusBadgeColor` to a shared utility (`src/lib/contact-badge-utils.ts`)
2. Added member status badges to search results inline with the contact name
3. Updated all 3 consumers to import from the shared utility
4. Fixed a pre-existing type error in the badge fallback return (missing `membershipStatusId`)

### Last Activity Badge (PR #90)

**Enhancement**: Added a "Last Activity" badge to the contact detail page showing when the most recent Activity_Log entry was recorded.

**Implementation**:
1. Added `lastActivity: string | null` to `ContactBadges` DTO
2. Added `getLastActivityDate()` private method in `ContactService` — queries `Activity_Log` table with `top: 1, orderBy: "Activity_Date DESC"` for the contact
3. Fetched in parallel with group/serving checks in `getContactBadges()`
4. Rendered as a sky-blue badge with relative date (e.g., "Last Activity: 3d ago") and full date tooltip
5. `formatLastActivity()` helper renders: Today, Yesterday, Nd ago, Nw ago, Nmo ago, Ny ago

### Bug Fix — Ambiguous Column Name (PR #90)

**Problem**: The `Member_Status_ID` column was ambiguous when joining the `Member_Status` lookup table in the Participants query, causing a 500 error from the MP API.

**Fix**: Qualified `Member_Status_ID` with the table name: `Participants.[Member_Status_ID]` in the select clause.

### Issue #88 — Add address to contact lookup page ✅ COMPLETED (PR #91)

**Changes:**
- Extended `ContactLookupDetails` DTO with address fields (`Address_Line_1`, `Address_Line_2`, `City`, `State/Region`, `Postal_Code`) and `Home_Address_Unlisted` flag
- Updated `ContactService.getContactByGuid()` to fetch address data via chained JOINs through the Household → Address relationship
- Qualified `Household_ID` with `Contacts.` to avoid ambiguous column error from the join
- Used raw `State/Region` field name (MP API doesn't support aliases on chained join columns)
- Added address display section and "Get Directions" pill button to the contact detail page
- Addresses marked as unlisted show a subtle "(Address marked as unlisted)" privacy note
- Platform-aware "Get Directions" button: Apple Maps on iOS, `geo:` scheme (system app picker) on Android, Google Maps web on desktop
- Moved action buttons (email, SMS, phone, directions) above the contact info grid
- Added phone number, email, and address as text fields with clipboard copy buttons
- Improved error messages in `getContactDetails` to include actual error cause

### Issue #83 — Venn Diagram Attendance Circle ✅ COMPLETED (PR #89)

**Problem**: Attendance circle (green dashed) disappeared when selecting a single month. Root cause was two-fold:

1. **Guard condition too strict** (original fix): `venn-diagram.tsx` required `activeCircles.length > 0` to show the attendance circle. Removed this guard.
2. **Weekly→monthly conversion semantics** (original fix): Fixed 3 weekly→monthly data conversions to divide by `eventCount`.
3. **Weekly data empty due to IIS URL length limit** (new fix): `getWeeklyAttendanceTrends()` queried `Event_Metrics` with all event IDs in a single request, causing an IIS 404 when the URL exceeded ~4096 chars. Changed to use `batchGetTableRecords` (same pattern as `getPeriodMetrics`).
4. **Fallback when weekly data unavailable** (new fix): `filterDashboardData()` unconditionally replaced monthly data with weekly data for single-month selections. When weekly data was `[]`, this zeroed out attendance. Added guard: only replace if weekly data has entries, otherwise keep monthly aggregated data.

**Files modified**:
- `src/components/dashboard/venn-diagram.tsx` — Removed `activeCircles.length > 0` guard, added `scaleRef` fallback, exported `computeLayout`
- `src/components/dashboard/filter-dashboard-data.ts` — Fixed weekly→monthly conversion, added fallback to monthly data when weekly is empty, exported `computePeriodMetrics`
- `src/services/dashboardService.ts` — Changed `getWeeklyAttendanceTrends()` to use `batchGetTableRecords` for Event_Metrics query

**Files created**:
- `src/components/dashboard/__tests__/filter-dashboard-data.test.ts` — 4 tests
- `src/components/dashboard/__tests__/venn-diagram.test.ts` — 9 tests

## Files Created
- `src/lib/contact-badge-utils.ts` — shared `statusBadgeColor` utility with status ID → Tailwind color mapping

## Files Modified
- `src/lib/dto/contacts.ts` — added `lastActivity` field to `ContactBadges`, address fields (including `State/Region`) to `ContactLookupDetails`
- `src/services/contactService.ts` — added `getLastActivityDate()`, integrated into `getContactBadges()` parallel fetch, extended `getContactByGuid()` with address JOINs, qualified ambiguous columns (`Member_Status_ID`, `Household_ID`)
- `src/services/dashboardService.ts` — changed `getWeeklyAttendanceTrends()` to batch Event_Metrics query
- `src/components/contact-lookup/contact-lookup-results.tsx` — added member status badge next to name in search results
- `src/components/contact-lookup-details/contact-lookup-details.tsx` — import shared utility, added `formatLastActivity()`, `formatAddress()`, `getDirectionsUrl()` helpers, last activity badge, address display with copy button, phone/email text fields with copy buttons, moved action buttons above info grid
- `src/components/contact-lookup-details/actions.ts` — updated fallback return to include `lastActivity: null`, improved error message to include cause
- `src/components/manage-members/member-card.tsx` — import `statusBadgeColor` from shared utility, removed local copy
- `src/components/manage-members/member-detail-modal.tsx` — import `statusBadgeColor` from shared utility, removed local copy
- `src/components/dashboard/venn-diagram.tsx` — removed strict guard, added fallback sizing, exported `computeLayout`
- `src/components/dashboard/filter-dashboard-data.ts` — weekly→monthly fallback, exported `computePeriodMetrics`

### Session 2 — Issues #92, #93, #94

#### Bug Fix — Contact Log Creation (Zod validation)
**Problem**: Creating a contact log failed with ZodError on `Contact_Date` — the date was converted to SQL format (`YYYY-MM-DD HH:MM:SS`) before Zod validation, which expects ISO datetime.
**Fix**: Moved Zod validation before the date format conversion in `contactLogService.ts`.

#### Bug Fix — Last Activity Badge Timezone
**Problem**: Tooltip showed previous day's date due to UTC parsing of date strings (e.g., `2026-03-12T00:00:00Z` → March 11 in CDT).
**Fix**: Added `parseLocalDate()` helper that extracts YYYY-MM-DD and constructs a local-midnight Date. Applied to both badge text and tooltip.

#### Issue #92 — Activity Log Excludes Group Participants ✅ COMPLETED
Added `AND Page_ID <> 316` to the `getLastActivityDate()` filter in `contactService.ts`.

#### Issue #93 — Membership Badge with Date Joined ✅ COMPLETED
- Added `membershipDate` field to `ContactBadges` DTO
- Extended Participants query to fetch `Date_Joined`
- For Registered (1), Associate (4), Youth (10) members: shows Date_Joined
- For Dropped members (status 5-9): fetches milestone 49 `Date_Accomplished` from `Participant_Milestones`
- New `getDroppedMilestoneDate()` private method in `ContactService`
- Badge displays date in parentheses: "Registered Member (Jan 5, 2020)"

#### Issue #94 — Contact Lookup Search Improvements ✅ COMPLETED
1. Added "Search by name, email, or phone number" helper text above input
2. Added clear X button inside search box
3. Mixed-type search: digits-only → phone, @ → email, else → name. All parts must match.
4. Refactored `scoreNameMatch()` → `classifySearchWord()` + `scoreNameOnly()` for clean separation

#### Badge Color Updates
- Associate Member and Youth Member: changed from blue/purple to amber
- Serving badge: changed from amber to emerald (matches "In a Group")

### Files Modified (Session 2)
- `src/services/contactLogService.ts` — moved Zod validation before SQL date conversion
- `src/services/contactService.ts` — added Date_Joined to participant query, Page_ID filter, `getDroppedMilestoneDate()` method, dropped milestone fetch
- `src/lib/dto/contacts.ts` — added `membershipDate` to `ContactBadges`
- `src/components/contact-lookup-details/actions.ts` — added `membershipDate: null` to fallback
- `src/components/contact-lookup-details/contact-lookup-details.tsx` — `parseLocalDate()` helper, membership date display, serving badge color change
- `src/components/contact-lookup/contact-lookup-search.tsx` — helper text, clear button, Tailwind layout
- `src/lib/processing-utils.ts` — `classifySearchWord()`, mixed-type search in `scoreNameMatch()`, extracted `scoreNameOnly()`
- `src/lib/contact-badge-utils.ts` — Associate/Youth badge colors → amber

#### CLAUDE.md — Timezone Handling Documentation
Added "Timezone Handling — Ministry Platform Dates" section documenting the UTC parsing pitfall, the `parseLocalDate()` pattern, and the Zod-before-SQL-conversion rule.

#### File Upload Limits — Match Ministry Platform (20 MB)
**Problem**: Upload limits were 1 MB with a restricted set of MIME types. MP allows 20 MB and accepts PNG, JPG, BMP, GIF, PDF, TXT, CSV.

**Changes** (11 files):
- `src/lib/processing-utils.ts` — `ALLOWED_IMAGE_TYPES` added `image/bmp`; `ALLOWED_DOCUMENT_TYPES` added `text/plain`, `text/csv`; `MAX_FILE_SIZE` 1 MB → 20 MB
- All error messages across 7 components updated from "Maximum 1 MB" → "Maximum 20 MB"
- All file input `accept` attributes updated to include `.bmp`, `.txt`, `.csv`, `.gif`, `.webp`
- `CLAUDE.md` security section updated with new types and 20 MB limit

**Files modified**:
- `src/lib/processing-utils.ts`
- `src/components/contact-lookup-details/contact-lookup-details.tsx`
- `src/components/compliance-processing/compliance-detail-modal.tsx`
- `src/components/journey-processing/journey-detail-modal.tsx`
- `src/components/shared-actions/processing.ts`
- `src/components/manage-members/actions.ts`
- `src/components/manage-members/transition-dialog.tsx`
- `src/components/processing/quick-actions-panel.tsx`
- `src/components/processing/milestone-edit-form.tsx`
- `src/components/processing/detail-modal-photo-upload.tsx`
- `CLAUDE.md`

## Verification
- TypeScript compilation passes, no new type errors
- All 45 processing-utils tests pass
- Security review: all filter params use existing sanitization or literal values, no PII logging

### Session 3 — Issue #97: Optimize Activity Log Cache

#### Issue #97 — Reduce Activity Log Query/Cache ✅ COMPLETED

**Problem**: The engagement venn diagram's Activity_Log query fetched every record across a ~5-year range, making it the slowest dashboard query. It also included Group Participants activity logs (Page_ID 316) which are redundant since the venn has a dedicated Groups dimension.

**Solution**: Replaced the single bulk query with per-month parallel queries using:
- `$select=Contact_ID` (only field needed)
- `$distinct=true` + `$groupBy=Contact_ID` (one row per unique contact per month)
- `Page_ID <> 316` filter (excludes Group Participants activity logs)

This eliminates the JS-side bucketing and Set-based deduplication — each API call directly returns unique Contact_IDs for that month.

**Files modified**:
- `src/services/dashboardService.ts` — replaced Activity_Log query + JS bucketing (lines 1333-1352) with per-month parallel queries using distinct+groupBy
- `.claude/ideas.md` — marked #97 as completed
- `.claude/status.md` — added to Recently Completed

#### Additional: Parallelize `getMonthlyAttendanceTrends()`

Reviewed all other dashboard cache queries for parallelization opportunities. Most are already optimized (dependency chains, batch queries). One high-impact candidate:

**`getMonthlyAttendanceTrends()`** looped through months sequentially — 2 API calls per month (Events → EventMetrics), 12 months × 2 year invocations = **48 sequential calls**. Replaced with `Promise.all` over months. Each month's pair remains sequential internally, but all months execute in parallel.

Other methods reviewed and determined to be already optimal:
- `getGroupTypeMetrics()` — dependency chain, already batched
- `getSmallGroupTrends()` — already reduced from 27→3 queries
- `getWeeklyAttendanceTrends()` — 2 dependent queries, already batched
- `getCommunityAttendanceTrends()` — dependency chain
- `getEventParticipantsByMonth()` — 2 dependent queries, already batched
- `getRosterAndAttendanceRaw()` — marginal gain, skipped
- `getServingLeadingRaw()` — 5 sequential dependencies, already batched

#### Fix: Edge Runtime Error in instrumentation.ts

**Problem**: `src/instrumentation.ts` used `await import('node:crypto')` which Next.js flags as incompatible with Edge Runtime during static analysis, even though the code has a runtime guard (`NEXT_RUNTIME !== 'nodejs'`).

**Fix**: Replaced `node:crypto` with the Web Crypto API (`globalThis.crypto.getRandomValues`), which is available in both Node.js and Edge runtimes.

**Files modified**:
- `src/instrumentation.ts` — replaced `node:crypto` import with `globalThis.crypto.getRandomValues`
