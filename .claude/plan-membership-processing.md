# Membership Processing Feature — Implementation Plan

## Context

Issue [#47](https://github.com/The-Moody-Church/mp-charts/issues/47) requests a dedicated membership processing page. The membership application process has 8 ordered milestones tracked in Ministry Platform for a single group (1025). This feature mirrors the volunteer processing pattern but is the simplest of the three processing features — no tabs, purely milestone-based, with an auto-complete action that ends group participation when someone becomes a Registered Member.

## Process Flow

```
Pre-Application → Application → Started Membership Class →
Completed Membership Class → Approved by LC → Listed in Bulletin 2 Weeks →
Presented to Congregation → Registered Member (ends group participation)
```

## Configuration

**Group**: Membership Applicants: Group_ID `1025` (single group, no tabs)

**Milestones (in order)**:
| # | Key | Label | Milestone_ID |
|---|-----|-------|-------------|
| 1 | `pre_application` | Membership Pre-Application | 27 |
| 2 | `application` | Membership Application | 42 |
| 3 | `started_class` | Started Membership Class | 43 |
| 4 | `completed_class` | Completed Membership Class | 44 |
| 5 | `approved_by_lc` | Membership Approved by LC | 45 |
| 6 | `listed_in_bulletin` | Membership Listed in Bulletin 2 Weeks | 46 |
| 7 | `presented_to_congregation` | Membership Presented to Congregation | 47 |
| 8 | `registered_member` | Registered Member | 48 |

**Excluded from checklist**: Dropped Membership (49) — managed directly in MP.

**Completion behavior**: When milestone 48 (Registered Member) is created, the service automatically sets `End_Date` on the applicant's Group_Participant record in Group 1025, removing them from the active list.

## New Files to Create

```
src/lib/dto/membership-processing.ts                  # DTOs
src/services/membershipService.ts                      # Service singleton
src/components/membership-processing/
  index.ts                                             # Barrel export
  actions.ts                                           # Server actions
  membership-processing.tsx                            # Main client component
  membership-card.tsx                                  # Grid card
  membership-detail-modal.tsx                          # Detail modal
src/app/(web)/membership-processing/page.tsx           # Route page
```

## Existing Files to Modify

- `src/lib/dto/index.ts` — add `export * from './membership-processing'`
- `src/components/layout/sidebar.tsx` — add nav item (production-visible, NOT dev-gated)
- `src/app/(web)/page.tsx` — add home page card (production-visible)
- `.env.example` — add membership env vars
- `.env.local` — add membership env var values

## Environment Variables

```bash
# Membership Processing Configuration
MEMBERSHIP_GROUP_ID=1025
MEMBERSHIP_PROGRAM_ID=307
MEMBERSHIP_DEFAULT_GROUP_ROLE_ID=2
MEMBERSHIP_PRE_APPLICATION_MILESTONE_ID=27
MEMBERSHIP_APPLICATION_MILESTONE_ID=42
MEMBERSHIP_STARTED_CLASS_MILESTONE_ID=43
MEMBERSHIP_COMPLETED_CLASS_MILESTONE_ID=44
MEMBERSHIP_APPROVED_BY_LC_MILESTONE_ID=45
MEMBERSHIP_LISTED_IN_BULLETIN_MILESTONE_ID=46
MEMBERSHIP_PRESENTED_TO_CONGREGATION_MILESTONE_ID=47
MEMBERSHIP_REGISTERED_MEMBER_MILESTONE_ID=48
```

## Architecture — Following Volunteer Processing Patterns

### DTOs (`src/lib/dto/membership-processing.ts`)

Simplified from volunteer processing — all checklist items are milestones, only 2 statuses:

- **`MembershipApplicantInfo`** — like `VolunteerInfo` but adds `Email_Address` and `Mobile_Phone`
- **`MembershipChecklistItem`** — milestone items with `key`, `label`, `milestoneId`, `completed`, `date`, `status` (`'complete' | 'not_started'`), `notes`, `order`
- **`MembershipCard`** — card data with `info`, `checklist`, `completedCount`, `totalCount`, `isFullyComplete`
- **`MembershipDetail`** — extends card with `milestones[]` (raw Participant_Milestone records) and `writeBackConfig`
- **`MembershipWriteBackConfig`** — `programId`, `groupId`, all milestone key→ID mappings
- **`MembershipMilestoneDetail`** — raw milestone record (`Participant_Milestone_ID`, `Milestone_ID`, `Date_Accomplished`, `Notes`)
- **`MembershipMilestoneFileInfo`** — reuse pattern from `MilestoneFileInfo` (fileId, fileName, fileUrl, isPdf, isImage)

### Service (`src/services/membershipService.ts`)

Singleton with `getInstance()` — same pattern as `volunteerService.ts`.

**Public methods:**
| Method | Purpose | Adapted From |
|--------|---------|-------------|
| `getApplicants()` | Fetch all active applicants in Group 1025 | `getInProcessVolunteers()` |
| `getApplicantDetail()` | Full detail for modal | `getVolunteerDetail()` — milestones only |
| `createMilestone()` | Create a new milestone record | `createMilestone()` — identical pattern |
| `updateMilestone()` | Update date/notes on existing milestone | `updateMilestone()` — identical pattern |
| `completeMembership()` | **NEW** — creates milestone 48 + sets End_Date on Group_Participant | New (combines milestone create + group end) |
| `getMilestoneFiles()` | List files attached to a milestone | `getMilestoneFiles()` — identical |
| `uploadDocument()` | Attach file to milestone record | `uploadDocument()` — identical |
| `uploadContactPhoto()` | Upload/update contact photo | `uploadContactPhoto()` — identical |

**Private helpers (reuse patterns):**
- `getContactsForParticipants()` — batch Participant→Contact lookup, extended to fetch `Email_Address, Mobile_Phone`
- `fetchMilestones()` — batch query `Participant_Milestones` for milestone IDs 27,42,43,44,45,46,47,48
- `buildChecklistForApplicant()` — data-driven from ordered config array, much simpler than volunteer's builder

**`completeMembership()` logic:**
1. Create Participant_Milestone record for milestone 48 (Registered Member) with Date_Accomplished
2. Update the applicant's Group_Participant record in Group 1025 with `End_Date = now`
3. This removes them from future `getApplicants()` queries (which filter `End_Date IS NULL OR End_Date >= now`)

### Server Actions (`src/components/membership-processing/actions.ts`)

Same `"use server"` + `requireSession()` + delegate pattern:

- `getApplicants()` — list data
- `getApplicantDetail()` — modal data
- `createMembershipMilestone()` — milestone create via FormData
- `updateMembershipMilestone()` — milestone update via FormData
- `completeMembership()` — creates milestone 48 + ends group participation
- `getMembershipMilestoneFiles()` — file listing
- `uploadApplicantPhoto()` — photo upload

### Components

**Page** (`src/app/(web)/membership-processing/page.tsx`):
- PPR pattern: sync wrapper with `<Suspense>` → async `MembershipProcessingContent` awaits `searchParams`
- Deep link param: `?applicant=123` (Group_Participant_ID)

**Main** (`membership-processing.tsx`):
- `"use client"` — no tabs, single flat card grid
- Loading state, error handling, refresh after mutations
- Badge showing total count
- Deep link auto-open logic (same pattern as volunteer's `useEffect`)

**Card** (`membership-card.tsx`):
- Photo (circular with initials fallback), name, progress (`completedCount/totalCount`)
- 8 checklist status icons: green check (complete) or gray circle (not started)
- Visual indicator if fully complete (green "Complete" badge)
- Click to open detail modal

**Detail Modal** (`membership-detail-modal.tsx`):
- **Header**: Clickable photo (upload on click), name, "Applicant since {date}", MP link, copy deep link button
- **Contact info**: Email (mailto link) and phone (tel link)
- **Complete Membership** section: When all 7 prior milestones are done, highlighted section with "Complete Membership" button that creates milestone 48 and ends group participation. Confirm dialog before executing.
- **Checklist**: 8 expandable items, each with date, notes, edit mode, file upload
- **Quick Actions**: "Select next milestone to complete" dropdown, date/notes/file inputs, create button

## Key Differences from Volunteer/Baptism Processing

| Aspect | Volunteer | Baptism (planned) | Membership |
|--------|-----------|-------------------|------------|
| Tabs | In Process / Approved | Current / Paused | **None (single list)** |
| Groups | Multiple (env var) | 2 (current + paused) | **1 (Group 1025)** |
| Checklist types | Mixed (milestones + forms + certs + BG) | Milestones only | **Milestones only** |
| Checklist count | 9 mixed | 9 milestones | **8 milestones** |
| Statuses | 6 types | 2 (complete, not_started) | **2 (complete, not_started)** |
| Special actions | Assign to Group | Pause/Resume | **Complete (end group)** |
| Contact info | Not shown | Email + phone | **Email + phone** |
| File uploads | Yes | Yes | **Yes** |
| Photo upload | Yes | Yes | **Yes** |
| On completion | Move to approved group | Capstone milestone | **End group participation** |

## Implementation Phases

### Phase 1: Data Layer
1. Create `src/lib/dto/membership-processing.ts` — all DTOs
2. Update `src/lib/dto/index.ts` — add barrel export
3. Add env vars to `.env.example` and `.env.local`
4. Create `src/services/membershipService.ts` — singleton service with all methods

### Phase 2: Server Actions
5. Create `src/components/membership-processing/actions.ts` — all server actions

### Phase 3: UI Components
6. Create `src/components/membership-processing/membership-card.tsx` — card component
7. Create `src/components/membership-processing/membership-detail-modal.tsx` — modal component
8. Create `src/components/membership-processing/membership-processing.tsx` — main component
9. Create `src/components/membership-processing/index.ts` — barrel export

### Phase 4: Route + Navigation
10. Create `src/app/(web)/membership-processing/page.tsx` — route page (PPR)
11. Modify `src/components/layout/sidebar.tsx` — add nav item
12. Modify `src/app/(web)/page.tsx` — add home page card

### Phase 5: Verification
13. `npm run build` — must pass type checking
14. `npm run dev` — navigate to `/membership-processing`
15. Verify applicant cards load from Group 1025
16. Click card → modal opens with checklist, contact info, MP link
17. Mark milestones complete → verify records created in MP
18. Edit milestone date/notes → verify update in MP
19. Upload file to milestone → verify attachment in MP
20. Complete membership → verify milestone 48 created + End_Date set on Group_Participant
21. Deep link: `/membership-processing?applicant=123` opens correct modal
22. Upload contact photo → verify photo updates

## Documentation Updates

- Update `ideas.md` entry for #47 with implementation details
- Update `CLAUDE.md` if any new patterns emerge
- Create/update session summary
