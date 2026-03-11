# Session Summary — 2026-03-11

## Objectives
- Implement cache warming on container start (#80)
- Ensure all `'use cache'` functions are pre-warmed automatically
- Document the pattern so future cached functions are also registered

## Work Done

### Cache Warming Implementation (#80) — Prior Session

**Problem**: When the Docker container starts, all caches are cold. The first user to hit the dashboard or contact lookup waits for the full data fetch (multiple MP API calls, some taking 10+ seconds for engagement data).

**Solution**: Automatic cache warming via Next.js instrumentation hook + internal API endpoint.

**Architecture**:
1. `src/instrumentation.ts` — `register()` fires on server start, polls the warming endpoint until the server is ready (up to 10 retries, 2s apart)
2. `src/app/api/cache-warm/route.ts` — GET endpoint protected by `CACHE_WARM_SECRET` env var, calls `warmAllCaches()`
3. `src/lib/cache-warming.ts` — Central registry that calls every `'use cache'` function with computed parameters. All 5 cached functions run in parallel.

**Files created**:
- `src/components/dashboard/cached-data.ts` — Extracted 4 dashboard `'use cache'` functions from `actions.ts` (needed because `actions.ts` has `'use server'` which would make exports into server actions)
- `src/lib/cache-warming.ts` — Central warming orchestrator with `warmAllCaches()`
- `src/app/api/cache-warm/route.ts` — API endpoint for triggering warming
- `src/instrumentation.ts` — Next.js hook for automatic warming on server start

**Files modified**:
- `src/components/dashboard/actions.ts` — Now imports cached functions from `cached-data.ts` instead of defining them inline
- `CLAUDE.md` — Added "Cache Warming" section with mandatory steps for registering new cached functions, updated cached functions table with correct file paths

**Cached functions warmed** (all 6):
| Function | Source | TTL |
|---|---|---|
| `getCachedDashboardData` | `cached-data.ts` | 6h |
| `getCachedFullRangeData` | `cached-data.ts` | 6h |
| `getCachedExtendedData` | `cached-data.ts` | 6h |
| `getCachedEngagementData` | `cached-data.ts` | 6h |
| `getCachedGroupTypes` | `dashboardService.ts` | 24h (warmed indirectly via dashboard data) |
| `getCachedAllContacts` | `cached-contacts.ts` | 6h |

**Environment variable required**: `CACHE_WARM_SECRET` — any random string. Without it, warming is skipped silently.

**Key decisions**:
- Extracted cached functions to a separate non-`'use server'` file so they can be imported by both `actions.ts` and the warming module
- Used `instrumentation.ts` polling instead of a Docker entrypoint script — cleaner, no Dockerfile changes needed
- All caches warm in parallel for fastest startup
- Secret-based auth on the API endpoint (proxy already allows `/api/*` through)

### Cache Warming Audit & Documentation Gaps — This Session

Audited all `'use cache'` functions across the codebase to verify completeness:
- **All 6 cached functions confirmed registered** in `cache-warming.ts`
- Found 2 files missing the mandatory cross-reference comment pointing to `cache-warming.ts`

**Files modified**:
- `src/services/dashboardService.ts` — Added NOTE comment to `getCachedGroupTypes` pointing to `cache-warming.ts` and explaining it's warmed indirectly
- `src/components/contact-lookup/cached-contacts.ts` — Added NOTE comment to `getCachedAllContacts` pointing to `cache-warming.ts`

**Security review**: Comment-only changes. No code logic, no filter interpolation, no PII, no auth changes. All checklist items pass.

### Manage Members Feature — Session 2

Implemented the full "Manage Members" page per `.claude/plans/plan-membership-management.md`.

**Files created**:
- `src/lib/dto/members.ts` — DTOs: `MemberCard`, `MemberStatusGroup`, `TransitionPayload`, constants (`STATUS_TO_MILESTONE`, `MEMBER_STATUS_GROUPS`, `MEMBERS_PAGE_SIZE`)
- `src/services/memberService.ts` — Singleton service: `getMembers` (paginated), `getStatusCounts`, `getMemberStatuses`, `addMilestone`, `attachFileToMilestone`, `updateMemberStatus`
- `src/components/manage-members/actions.ts` — Server actions: `fetchMembers`, `fetchStatusCounts`, `fetchMemberStatuses`, `transitionMember`
- `src/components/manage-members/manage-members-shell.tsx` — Client shell: tabs, debounced search (300ms), pagination (50/page), transition dialog orchestration
- `src/components/manage-members/member-card.tsx` — Card with photo, name, status badge, contact info, "Change Status" button
- `src/components/manage-members/member-tabs.tsx` — Tab bar: Registered, Associate, Youth, No Status, Dropped (with counts)
- `src/components/manage-members/transition-dialog.tsx` — Status transition: select target status, auto-mapped milestone, date, notes (auto-prefix for Dropped), file attachment
- `src/components/manage-members/index.ts` — Barrel exports
- `src/app/(web)/manage-members/page.tsx` — Server page with Suspense/PPR pattern

**Files modified**:
- `src/lib/dto/index.ts` — Added `members` barrel export
- `src/lib/authorization.ts` — Added `"manage-members"` to `StaticFeature`, `DEFAULT_CONFIG`, `getAccessibleFeatures`
- `src/components/layout/sidebar.tsx` — Added "Manage Members" nav item with `UserGroupIcon`
- `src/components/home/home-cards.tsx` — Added "Manage Members" feature card
- `README.md` — Added manage-members to project structure, features, components, and services

**Key decisions**:
- Used `Participant_Milestones` table (not `Contact_Milestones` — corrected during session)
- Server-side pagination at 50/page; lightweight status count query for tab totals
- All filter strings use `sanitizeFilterValue()` / `sanitizeIds()` for injection safety
- Feature access via `requireFeatureAccess("manage-members")` with tiered rate limiting
- Dropped notes auto-prefixed with specific member status name from lookup table

**Security review**:
- **Files reviewed**: 14 files
- **Filter injection**: All user inputs sanitized — `sanitizeFilterValue()` for search, `sanitizeIds()` for status IDs. ✅
- **Authentication**: All server actions call `requireFeatureAccess("manage-members")` before data access. ✅
- **Rate limiting**: `"search"` tier for reads, `"write"` tier for transitions, file validation with `ALLOWED_DOCUMENT_TYPES` + `MAX_FILE_SIZE`. ✅
- **Input validation**: contactId, participantId, newStatusId validated as non-NaN numbers; milestoneDate required. ✅
- **PII logging**: Only `console.error` for errors, no PII logged. ✅
- **File uploads**: MIME type + size validated server-side. ✅
- **No hardcoded secrets, no open redirects**. ✅
- **Issues found**: None
- **Checklist**: All critical/high items pass

### Manage Members — Bugfixes & Search Overhaul

**Bug: Ambiguous column name 'Contact_ID'**:
- Contacts → Participant_Record join produced duplicate Contact_ID columns
- Fixed by qualifying as `Contacts.[Contact_ID]` in queries

**Removed "No Status" tab**:
- Members without a `Member_Status_ID` are no longer shown — all nulls filtered out
- Removed the "no-status" entry from `MEMBER_STATUS_GROUPS`

**Search overhaul — switched from server-side LIKE to cached scored search**:
- Added `Participant_ID`, `Member_Status_ID`, `Member_Status` fields to `ContactSearch` DTO
- Updated `contactService.getAllContactsForSearch` to include participant join fields
- Rewrote `actions.ts` to use `getCachedAllContacts()` + `searchByNameFlat()` (Soundex/Levenshtein scored search) instead of server-side LIKE queries
- Cleaned up `memberService.ts` — removed unused read methods (`getMembers`, `getStatusCounts`, `buildMemberFilter`) and associated types/imports; service now only contains write methods + `getMemberStatuses` lookup

**Files modified**:
- `src/lib/dto/contacts.ts` — Added participant/membership fields to `ContactSearch`
- `src/services/contactService.ts` — Added participant join to `getAllContactsForSearch` select
- `src/components/manage-members/actions.ts` — Rewritten: cache-based search with `searchByNameFlat`
- `src/services/memberService.ts` — Removed unused read methods and imports

### Member Detail Modal & Date Joined

Added a detail modal that opens when clicking a member card, similar to the journey tracker detail modals.

**Features**:
- Photo with upload-on-click (reuses `DetailModalPhotoUpload` shared component)
- Name, status badge, "Member since" date from `Participant.Date_Joined`
- Email/phone/SMS pill-style buttons (reuses `ContactLinks` shared component)
- "View in Ministry Platform" link
- Membership History: all milestones from Journey 7 (Registered, Associate, Youth, Dropped) with dates and notes
- "Change Status" button that opens the existing transition dialog

**Date Joined on cards**: Member cards now show "Since {date}" below the status badge when `Date_Joined` is set on the participant record.

**Files created**:
- `src/components/manage-members/member-detail-modal.tsx` — Detail modal with contact info, milestones, photo upload

**Files modified**:
- `src/lib/dto/contacts.ts` — Added `Date_Joined` to `ContactSearch`
- `src/lib/dto/members.ts` — Added `dateJoined` to `MemberCard`, new `MemberMilestone` and `MemberDetail` interfaces
- `src/services/contactService.ts` — Added `Date_Joined` to cached contacts select
- `src/services/memberService.ts` — Added `getMemberMilestones()` method (fetches from Participant_Milestones for Journey 7 milestone IDs)
- `src/components/manage-members/actions.ts` — Added `fetchMemberDetail`, `uploadMemberPhoto` actions; `toMemberCard` now includes `dateJoined`
- `src/components/manage-members/member-card.tsx` — Card is now clickable (opens detail modal), shows date joined, removed "Change Status" button (moved to modal)
- `src/components/manage-members/manage-members-shell.tsx` — Added detail modal state management, card click → modal flow
- `src/components/manage-members/index.ts` — Added `MemberDetailModal` barrel export

### Detail Modal Refinements

**MP link fixed**: Changed from contact page (`/mp/292/{contactId}`) to participant page (`/mp/355/{participantId}`). Styled as simple blue link text ("View in MP") matching the journey detail modal pattern.

**All Journey 7 milestones**: Changed milestone query from hardcoded `Milestone_ID IN (48,49,51,52)` to `Milestone_ID_Table.[Journey_ID] = ${MEMBERSHIP_JOURNEY_ID}`, so all milestones belonging to Journey 7 appear in the member detail modal, not just the status-mapped ones.

**Copy Link deep link**: Added "Copy Link" button to the detail modal that copies `/manage-members?member={contactId}` URL. The page accepts a `?member=contactId` query param — on load, the shell auto-opens the detail modal for that member via a useEffect.

**Files modified**:
- `src/app/(web)/manage-members/page.tsx` — Added `searchParams` prop, parses `?member=contactId`, passes `initialMemberId` to shell
- `src/components/manage-members/manage-members-shell.tsx` — Added `initialMemberId` prop, deep link auto-open via useEffect + `fetchMemberDetail`
- `src/components/manage-members/member-detail-modal.tsx` — Added "Copy Link" button, fixed MP link URL/styling
- `src/services/memberService.ts` — Changed milestone filter to use `Journey_ID` instead of hardcoded milestone IDs

### Runtime Error Investigation

User reported `Element type is invalid. Received a promise that resolves to: undefined. Lazy element type must resolve to a class or function.` at `BreadcrumbOverrideProvider` in `layout.tsx:58` when navigating to `/manage-members?member=221795`.

**Investigation**: Build passes cleanly (`npm run build` succeeds, route shows as `◐ Partial Prerender`). The `BreadcrumbOverrideProvider` is a standard `"use client"` context provider. The error was **not reproducible** after a clean build — it was a dev server hot reload artifact from modifying the page component to accept `searchParams`.

### Cache Invalidation & Optimistic Updates

**Problem**: After a membership status transition, the cached contacts data still showed the old status. Users had to wait for the 6h cache TTL or a full cache rebuild.

**Solution**: Two-pronged approach:
1. **Cache invalidation**: `revalidateTag('contacts-search', { expire: 0 })` after successful transitions in `actions.ts`
2. **Optimistic UI update**: `handleTransitionSuccess` in `manage-members-shell.tsx` immediately removes the member from the current list and adjusts tab counts locally, so users see the change instantly without waiting for cache rebuild

**Files modified**:
- `src/components/manage-members/actions.ts` — Added `revalidateTag` import and call after `updateMemberStatus`
- `src/components/manage-members/manage-members-shell.tsx` — `handleTransitionSuccess` now accepts `newStatusId`, optimistically updates local state (removes member from list, adjusts counts)
- `src/components/manage-members/transition-dialog.tsx` — `onSuccess` signature changed to `(newStatusId: number) => void`

### Bugfixes

**Ambiguous column name `Milestone_ID`**: MP REST API returned 500 when querying `Participant_Milestones` with a join to `Milestone_ID_Table`. Fixed by qualifying as `Participant_Milestones.[Milestone_ID]` in the select clause of `memberService.ts`.

**Deep link silent failure**: `fetchMemberDetail` threw due to the ambiguous column error, but the useEffect in `manage-members-shell.tsx` had no `.catch()` handler. Fixed both: qualified the column name AND added error handling with `console.warn` to the deep link useEffect.

**Files modified**:
- `src/services/memberService.ts` — Qualified `Milestone_ID` → `Participant_Milestones.[Milestone_ID]`
- `src/components/manage-members/manage-members-shell.tsx` — Added `.catch()` to deep link useEffect

### Cache Warming Format

Updated cache warming log output to use `m:ss.xx` format (e.g., `1:36.63`) instead of raw milliseconds.

**Files modified**:
- `src/app/api/cache-warm/route.ts` — Added `formatDuration(ms)` helper, updated all log output

### Journey-Style Expandable Milestones

Upgraded the milestone display in the member detail modal to match the journey processing expandable card layout.

**Features**:
- Each milestone card shows: name, date, small "MP" link to `/mp/344/{participantMilestoneId}`, paperclip icon (when files exist), expand/collapse chevron
- Expanded view shows notes and file attachments (reuses shared `MilestoneExpandedView` component)
- Files are lazily loaded on first expand via `fetchMilestoneFiles` server action

**Files created/modified**:
- `src/components/manage-members/member-detail-modal.tsx` — Full rewrite of milestone section with expandable `MilestoneItem` subcomponent
- `src/components/manage-members/actions.ts` — Added `fetchMilestoneFiles` server action
- `src/services/memberService.ts` — Added `getMilestoneFiles(milestoneRecordId)` method using `getFilesByRecord`

### Program_ID Fix & Central Time on Milestones

**Bug: 500 on Participant_Milestones POST**: `Program_ID` is a required non-nullable field. Fixed by adding `MEMBERSHIP_PROGRAM_ID = 307` constant and including it in the milestone record.

**Bug: Date_Accomplished missing time component**: Milestones created with `YYYY-MM-DD` only. Fixed by appending Central time: `${data.milestoneDate}T${nowCentral().split("T")[1]}`. Also extracted `nowCentral()` to shared `processing-utils.ts` to eliminate duplication across 3 services.

**Files modified**:
- `src/lib/dto/members.ts` — Added `MEMBERSHIP_PROGRAM_ID = 307`
- `src/services/memberService.ts` — Added Program_ID to milestone record, appended Central time to Date_Accomplished
- `src/lib/processing-utils.ts` — Added shared `nowCentral()` function
- `src/services/journeyProcessingService.ts` — Replaced local `nowCentral()` with shared import
- `src/services/complianceProcessingService.ts` — Replaced local `nowCentral()` with shared import

### Client-Side Transition Overrides & Cache Improvements

**Problem**: After status transition, `revalidateTag('contacts-search', { expire: 0 })` forced cold cache miss on next search, making subsequent searches slow.

**Solution**:
1. Removed immediate cache invalidation after transitions
2. Track transitions client-side in `overridesRef` (Map<contactId, { oldStatusId, newStatusId }>)
3. Patch stale server data with overrides on each load
4. Added manual cache refresh button (rate-limited to 5/hour)

**Problem**: Two server actions per search consumed 2 rate limit hits, allowing only ~15 searches/min. Rate limit errors crashed the page.

**Solution**:
1. Merged `fetchMembers` + `fetchStatusCounts` into single `fetchMembersAndCounts`
2. Added try/catch in client's `loadMembers` to degrade gracefully
3. Added cache refresh button with spinning arrow icon

**Files modified**:
- `src/components/manage-members/actions.ts` — Merged into `fetchMembersAndCounts`, removed immediate invalidation, added `refreshMemberCache`
- `src/components/manage-members/manage-members-shell.tsx` — Added overrides ref, patching logic, refresh button, error handling
- `src/app/(web)/manage-members/page.tsx` — Updated to use `fetchMembersAndCounts`

## Status

- Build: Passes
- Tests: Not affected (no test files changed)
- PR #84: Merged to main ✅
