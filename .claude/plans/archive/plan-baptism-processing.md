# Baptism Processing Feature — Implementation Plan

## Context

Issue [#17](https://github.com/The-Moody-Church/mp-charts/issues/17) requests a dedicated baptism processing page. The baptism application process has 9 ordered milestones tracked in Ministry Platform, managed across two groups (current vs paused applicants). This feature mirrors the volunteer processing pattern but is simpler — purely milestone-based with no form responses, certifications, or background checks.

## Process Flow

```
Application submitted → Confirmation email sent → Interview scheduled →
Interview completed → [Approved OR Paused] → Info request email sent →
Items received → Baptism scheduled → Baptism (capstone + certificate upload)
```

## Configuration

**Groups (tabs)**:
- Current Applicants: Group_ID `1023`
- Paused Applicants: Group_ID `1024`

**Milestones (in order)**:
| # | Key | Label | Milestone ID |
|---|-----|-------|-------------|
| 1 | `application` | Application | 26 |
| 2 | `confirmation_email` | Confirmation Email Sent | 41 |
| 3 | `scheduled_interview` | Interview Scheduled | 39 |
| 4 | `completed_interview` | Interview Completed | 25 |
| 5 | `approved` | Approved for Baptism | 38 |
| 6 | `info_request_email` | Info Request Email Sent | 37 |
| 7 | `items_received` | Baptism Items Received | 36 |
| 8 | `scheduled` | Baptism Scheduled | 35 |
| 9 | `baptism` | Baptism (capstone) | 3 |

**Special**: Baptism Process Paused — Milestone 40 (triggers group move)

## New Files to Create

```
src/lib/dto/baptism-processing.ts                  # DTOs
src/services/baptismService.ts                      # Service singleton
src/components/baptism-processing/
  index.ts                                          # Barrel export
  actions.ts                                        # Server actions
  baptism-processing.tsx                            # Main client component (tabs)
  baptism-card.tsx                                  # Grid card
  baptism-detail-modal.tsx                          # Detail modal
src/app/(web)/baptism-processing/page.tsx           # Route page
```

## Existing Files to Modify

- `src/lib/dto/index.ts` — add `export * from './baptism-processing'`
- `src/components/layout/sidebar.tsx` — add nav item (production-visible, NOT dev-gated)
- `src/app/(web)/page.tsx` — add home page card
- `.env.example` — add baptism env vars
- `.env.local` — add baptism env var values

## Environment Variables

```bash
BAPTISM_CURRENT_GROUP_ID=1023
BAPTISM_PAUSED_GROUP_ID=1024
BAPTISM_PROGRAM_ID=306
BAPTISM_DEFAULT_GROUP_ROLE_ID=2
BAPTISM_APPLICATION_MILESTONE_ID=26
BAPTISM_CONFIRMATION_EMAIL_MILESTONE_ID=41
BAPTISM_SCHEDULED_INTERVIEW_MILESTONE_ID=39
BAPTISM_COMPLETED_INTERVIEW_MILESTONE_ID=25
BAPTISM_APPROVED_MILESTONE_ID=38
BAPTISM_INFO_REQUEST_EMAIL_MILESTONE_ID=37
BAPTISM_ITEMS_RECEIVED_MILESTONE_ID=36
BAPTISM_SCHEDULED_MILESTONE_ID=35
BAPTISM_CAPSTONE_MILESTONE_ID=3
BAPTISM_PAUSED_MILESTONE_ID=40
```

## Architecture — Following Volunteer Processing Patterns

### DTOs (`src/lib/dto/baptism-processing.ts`)

Simplified from volunteer processing — all checklist items are milestones:

- **`BaptismApplicantInfo`** — like `VolunteerInfo` but adds `Email_Address` and `Mobile_Phone` (for admin to contact applicants from the modal)
- **`BaptismChecklistItem`** — ordered milestone items with `key`, `label`, `milestoneId`, `completed`, `date`, `status` (`complete | not_started`), `notes`, `order`
- **`BaptismCard`** — card data with `info`, `checklist`, `completedCount`, `totalCount`, `isPaused`, `isFullyComplete`
- **`BaptismDetail`** — extends card with `milestones[]` (raw records) and `writeBackConfig`
- **`BaptismWriteBackConfig`** — `programId`, milestone key→ID map, group IDs, pause milestone ID

### Service (`src/services/baptismService.ts`)

Singleton with `getInstance()` — same pattern as `volunteerService.ts:119-144`.

**Public methods:**
| Method | Adapted From |
|--------|-------------|
| `getCurrentApplicants()` | `getInProcessVolunteers()` (line 168) |
| `getPausedApplicants()` | Same pattern, different group ID |
| `getApplicantDetail()` | `getVolunteerDetail()` (line 274) — simpler, milestones only |
| `createMilestone()` | `createMilestone()` (line 427) — identical |
| `updateMilestone()` | `updateMilestone()` (line 546) — identical |
| `getMilestoneFiles()` | `getMilestoneFiles()` (line 452) — identical |
| `uploadDocument()` | `uploadDocument()` (line 604) — identical |
| `uploadContactPhoto()` | `uploadContactPhoto()` (line 624) — identical |
| **`pauseApplicant()`** | **NEW** — creates pause milestone + moves to paused group (Role_ID 2) |
| **`resumeApplicant()`** | **NEW** — moves back to current group (Role_ID 2) |

**Checklist builder** — data-driven from ordered config array. Much simpler than volunteer's 200-line builder (`volunteerService.ts:973-1202`) since every item is a milestone lookup.

**Contact query** — extends volunteer pattern to also select `Email_Address,Mobile_Phone` from Contacts table.

### Server Actions (`src/components/baptism-processing/actions.ts`)

Same `"use server"` + `requireSession()` + delegate pattern as volunteer `actions.ts`:

- `getCurrentApplicants()`, `getPausedApplicants()` — tab data
- `getApplicantDetail()` — modal data
- `createBaptismMilestone()`, `updateBaptismMilestone()` — milestone CRUD via FormData
- `getBaptismMilestoneFiles()` — file listing
- `uploadApplicantPhoto()` — photo upload
- `pauseApplicant()`, `resumeApplicant()` — group transfer actions

### Components

**Page** (`src/app/(web)/baptism-processing/page.tsx`):
- Sync wrapper with Suspense + async inner component (PPR pattern, same as volunteer page)
- Deep link param: `?applicant=123`
- Pattern: page exports sync function → `<Suspense>` → async `PageContent` awaits `searchParams`

**Main** (`baptism-processing.tsx`):
- `"use client"` with two tabs: "Current Baptism Applicants" / "Paused Baptism Applicants"
- No group filter dropdown (simpler than volunteer's approved tab)
- Badge counts on tabs

**Card** (`baptism-card.tsx`):
- Photo, name, progress (`completedCount/totalCount`), checklist status icons
- Visual badge for paused or fully complete state
- No expiration icons (milestones don't expire)

**Detail Modal** (`baptism-detail-modal.tsx`):
- **Header**: Photo (clickable upload), name, "Applicant since {date}", email + phone links, MP link, copy deep link
- **Contact info section** (NEW): mailto and tel links for admin convenience
- **Approval/Pause decision** (NEW): After interview completed, shows "Approve for Baptism" and "Pause Process" buttons in a highlighted section
- **Resume button**: On paused tab, "Resume Baptism Process" button
- **Checklist**: 9 expandable items, each with date, notes, edit mode, file upload
- **Certificate upload**: On capstone milestone, file input labeled "Baptism Certificate (PDF)"
- **Quick Actions**: Select next milestone to complete, add date/notes/file

## Key Differences from Volunteer Processing

| Aspect | Volunteer | Baptism |
|--------|-----------|---------|
| Tabs | In Process / Approved | Current / Paused |
| Checklist types | Milestones + Forms + Certs + BG Checks | Milestones only |
| Checklist items | 9 mixed-type | 9 ordered milestones |
| Statuses | 6 (complete, in_progress, expired, expiring_soon, not_started, presumed_complete) | 2 (complete, not_started) |
| Special actions | Assign to Group | Pause/Resume + Approval choice |
| Contact info | Not shown | Email + phone in modal |
| Approved tab | Group filter dropdown | No filter needed |

## Implementation Phases

1. **Data layer**: DTOs, env vars, BaptismService
2. **Server actions**: actions.ts
3. **UI components**: card, modal, main component, barrel export
4. **Route + nav**: page, sidebar, home page
5. **Verification**: `npm run build`, test with live data

## Verification

1. `npm run build` — must pass (type checking)
2. `npm run dev` — navigate to `/baptism-processing`
3. Verify both tabs load applicant cards from Groups 1023/1024
4. Click a card → modal opens with checklist, contact info, MP link
5. Mark a milestone complete → verify record created in MP
6. Edit milestone date/notes → verify update in MP
7. Upload file to milestone → verify attachment in MP
8. Test approval flow: complete interview → approve → milestone 38 created
9. Test pause flow: pause → milestone 40 created, person moves to paused group
10. Test resume flow: person moves back to current group
11. Deep link: `/baptism-processing?applicant=123` opens correct modal
12. Upload certificate PDF on capstone milestone
