# Manage Members Tool — Implementation Plan

> **Purpose:** This document is a plan for Claude Code to implement a "Manage Members" feature in the `mp-charts` project (The-Moody-Church/mp-charts). Read CLAUDE.md and the existing codebase patterns before starting work.

---

## 1. Overview

Build a new **Manage Members** page (not a tool — this is a standalone page like `contactlookup` or `dashboard`) that gives staff a card-based view of all people who have a membership status on their Participant record. The UI is inspired by the Journeys system: cards for each person, tabbed by membership status, with the ability to add milestones that transition members between statuses.

### Key Behaviors

- Show all Contacts who have a Participant record with a non-null `Member_Status_ID`
- Contacts with a null `Member_Status_ID` on the Participant record should be surfaced separately (e.g. an "Unassigned" or "No Status" indicator/tab) so staff are informed
- People are displayed as cards with contact photo, name, key info
- Tabs at the top filter by membership status group
- All "Dropped" statuses (IDs 5–9) are grouped under a single "Dropped" tab
- **All statuses can transition to any other status**, including restoring Dropped members. Every member card gets a transition action regardless of current status. The transition dialog shows all valid target statuses (everything except the person's current status).
- Adding a milestone is a **two-step write**: create a record in the `Contact_Milestones` table AND update the `Participants` record's `Member_Status_ID` to the new value
- File attachments on milestones are supported (same pattern as Journeys/compliance pages)
- Contact photos displayed on cards (same pattern as Journeys/compliance pages via File Service)
- **Server-side pagination required** — expected member count is 2,000–5,000
- **Permissions** use the MP Security Role / page permission model: register a new page in MP's permission structure and use the same user group access pattern as other pages in the app

---

## 2. Member Status Reference (from MP)

| Member_Status_ID | Member_Status     | Tab Group         |
|-------------------|-------------------|-------------------|
| 1                 | Registered Member | Registered        |
| 4                 | Assoc Member      | Associate         |
| 5                 | Dropped-Death     | Dropped           |
| 6                 | Dropped-Purged    | Dropped           |
| 7                 | Dropped-Requested | Dropped           |
| 8                 | Dropped-Transferred | Dropped         |
| 9                 | Dropped-Excluded  | Dropped           |
| 10                | Youth Member      | Youth             |
| NULL              | (no status)       | No Status         |

Tab order suggestion: **Registered → Associate → Youth → No Status → Dropped** (Dropped last since it's historical/archive-like). Counts should show on each tab.

---

## 3. MP Tables & API Calls

### Read Operations

**Primary query — get members with participant + contact info (paginated, searchable):**
```
Table: Contacts
Select: Contact_ID, Display_Name, Nickname, First_Name, Last_Name, Email_Address, 
        Mobile_Phone, Contact_Status_ID, dp_fileUniqueId,
        Participant_Record_Table.[Participant_ID],
        Participant_Record_Table.[Member_Status_ID],
        Participant_Record_Table_Member_Status_ID_Table.[Member_Status]
Filter: Participant_Record IS NOT NULL
        AND <statusIds filter>          // e.g. Participant_Record_Table.[Member_Status_ID] IN (1)
        AND <search filter if present>  // e.g. (Display_Name LIKE '%term%' OR Email_Address LIKE '%term%' OR Mobile_Phone LIKE '%term%')
OrderBy: Last_Name, First_Name
Top: 50
Skip: <offset>
```

> **Search is server-side and works across all records**, not just the current page. Follow the same search pattern used on the **contact lookup page** (`src/components/contact-lookup/` and `src/services/contactService.ts`). Search matches against Display_Name, Email_Address, and Mobile_Phone (OR logic — any field matching is a hit). When a user types a search term, it builds an OR filter (e.g. `(Display_Name LIKE '%term%' OR Email_Address LIKE '%term%' OR Mobile_Phone LIKE '%term%')`) and re-fetches from page 1. Tab counts also update to reflect filtered results. Debounce the input to avoid excessive API calls — match whatever debounce timing the contact lookup page uses.

> **Pagination:** With 2,000–5,000 members, use server-side pagination. Fetch 50 records per page. The shell component tracks the current page and fetches the next batch via server action. Switching tabs or changing the search term resets to page 1.

> **Tab counts query** (separate, not paginated — must also apply the current search filter):
> ```
> Table: Contacts
> Select: Participant_Record_Table.[Member_Status_ID], COUNT(*) 
> Filter: Participant_Record IS NOT NULL
>         AND <search filter if present>  // same multi-field OR search as the main query
> GroupBy: Participant_Record_Table.[Member_Status_ID]
> ```
> If the MP REST API doesn't support GroupBy/COUNT natively, an alternative is a stored procedure or fetching just the IDs. Check if there's an existing pattern in the codebase for aggregation queries. Worst case, fetch all Contact_ID + Member_Status_ID pairs (lightweight — just two integer columns, with the same multi-field search filter applied) and count client-side.

> **Contact photos:** The `dp_fileUniqueId` field on Contacts provides the file identifier. Use the same approach as Journeys/compliance pages to construct the photo URL from `NEXT_PUBLIC_MINISTRY_PLATFORM_FILE_URL` + the unique ID. Reference the existing photo rendering pattern in the codebase.

**Member Statuses lookup (for tab labels and dropdown options):**
```
Table: Member_Statuses
Select: Member_Status_ID, Member_Status
```

**Membership Milestones (Journey_ID = 7) — hardcoded mapping, no runtime fetch needed:**

| Milestone_ID | Milestone_Title        | Maps to Member_Status_ID(s)         |
|--------------|------------------------|-------------------------------------|
| 48           | Registered Member      | 1 (Registered Member)               |
| 51           | Associate Membership   | 4 (Assoc Member)                    |
| 52           | Youth Membership       | 10 (Youth Member)                   |
| 49           | Dropped Membership     | 5, 6, 7, 8, 9 (all Dropped types)  |

The TransitionDialog auto-selects the milestone based on the target status. For Dropped transitions, the specific Dropped type name is auto-included in Notes.

### Write Operations

**Add a milestone (Contact_Milestones table):**
```
Table: Contact_Milestones
POST: {
  Contact_ID: <contact_id>,
  Milestone_ID: <auto-mapped from target status — see milestone reference table above>,
  Milestone_Date: <date>,  // user-selected or defaults to today
  Notes: <optional string — auto-prefixed with dropped type name for Dropped transitions>,
}
```

**Milestone auto-mapping logic:**
- Target is Registered (ID 1) → Milestone_ID = 48
- Target is Associate (ID 4) → Milestone_ID = 51
- Target is Youth (ID 10) → Milestone_ID = 52
- Target is any Dropped (IDs 5–9) → Milestone_ID = 49, Notes auto-prefixed with the specific Member_Status name (e.g., "Dropped-Death" or "Dropped-Transferred: <user's additional notes>")

**Attach file to milestone (if provided):**
Use the File Service (`MPHelper.uploadFiles()`) to attach a file to the newly created Contact_Milestone record, same pattern as Journeys/compliance pages. The file upload happens after the milestone POST returns the new record ID.
```
File Service: uploadFiles({
  tableName: 'Contact_Milestones',
  recordId: <new_contact_milestone_id>,
  files: [<uploaded_file>]
})
```

**Update participant membership status:**
```
Table: Participants
PUT: {
  Participant_ID: <participant_id>,
  Member_Status_ID: <new_status_id>
}
```

The write sequence is: (1) POST milestone → (2) upload attachment if provided → (3) PUT participant status. If step 1 succeeds but a later step fails, surface a clear error — the user can retry. Don't roll back the milestone on a status update failure.

---

## 4. File Structure

Follow existing project conventions (kebab-case folders, barrel exports, server components by default, `"use client"` only where needed).

```
src/
├── app/(web)/manage-members/
│   └── page.tsx                          # Server component — fetches initial data
│
├── components/manage-members/
│   ├── manage-members-shell.tsx          # Client component — tabs, filter state, card grid
│   ├── member-card.tsx                   # Individual member card component
│   ├── member-tabs.tsx                   # Tab bar with status groups and counts
│   ├── transition-dialog.tsx             # Dialog/modal for adding milestone + changing status
│   ├── actions.ts                        # Server actions (fetch members, add milestone, update status)
│   └── index.ts                          # Barrel exports
│
├── lib/dto/
│   └── members.ts                        # MemberCard DTO, MemberStatusGroup type, TransitionPayload type
│                                         # (also re-export from lib/dto/index.ts)
│
├── services/
│   └── memberService.ts                  # Singleton service — getMembers, getMemberStatuses,
│                                         #   getMilestones, addMilestone, updateMemberStatus
```

### Navigation

Add a "Manage Members" link to the sidebar in `src/components/layout/sidebar.tsx` (or wherever nav items are configured). Use an appropriate icon (e.g. `Users` from lucide-react).

---

## 5. Component Details

### `page.tsx` (Server Component)
- Fetch initial page of members (first 50), status counts, and member statuses via server actions
- Pass data to `ManageMembersShell`
- Use the same auth/session pattern as the dashboard page
- Milestone mapping is hardcoded (STATUS_TO_MILESTONE) — no upfront milestone fetch needed

### `ManageMembersShell` (Client Component — `"use client"`)
- Manages active tab state, current page (pagination offset), and search term
- Renders `MemberTabs` and a grid of `MemberCard` components
- **Search input** above the card grid — server-side search matching Display_Name, Email_Address, and Mobile_Phone (same multi-field search as the contact lookup page). Debounced. Typing a search term re-fetches from page 1 with the search filter applied to the API query. Tab counts also update to reflect filtered results. Follow the same search implementation pattern as `src/components/contact-lookup/`.
- Pagination controls (previous/next) that fetch the next batch of 50 via server action, filtered by the active tab's status IDs and current search term
- Switching tabs resets to page 1 (but preserves search term)
- Clearing search resets to page 1 and restores unfiltered counts
- Handles the callback from `TransitionDialog` to optimistically update the card (move it to the new tab) or refetch the current page

### `MemberTabs`
- Horizontal tab bar showing: Registered, Associate, Youth, No Status, Dropped
- Each tab shows the count of members in that group — counts update when search term changes (filtered counts from server)
- Click switches the active filter and resets to page 1
- Use shadcn Tabs or a simple custom tab component

### `MemberCard`
- Displays: contact photo (from `dp_fileUniqueId`, with fallback avatar/initials), name, nickname (if different), email, phone
- Shows current Member_Status as a badge
- **All cards** get a transition action button that opens `TransitionDialog` (not just Registered)
- Follow the same photo rendering pattern used in Journeys/compliance pages
- Use shadcn Card component

### `TransitionDialog`
- Modal/dialog triggered from any MemberCard's action button
- Fields:
  - **New Status**: dropdown showing all member statuses EXCEPT the person's current status. For Dropped statuses, show each individually (Dropped-Death, Dropped-Requested, etc.) so the specific reason is captured.
  - **Milestone**: auto-selected based on the chosen target status (not a user-facing dropdown — display as read-only label so the user knows which milestone is being recorded). Mapping: Registered→48, Associate→51, Youth→52, any Dropped→49.
  - **Date**: date picker, defaults to today
  - **Notes**: optional textarea. For Dropped transitions, auto-prefix with the specific dropped type name (e.g., "Dropped-Death"). User can append additional notes after the prefix.
  - **Attachment**: optional file upload — follow the same pattern as Journeys/compliance pages for file handling
- On submit: calls server action that does the three-step write (POST milestone → upload file → PUT participant status)
- Shows loading state, success confirmation, or error with clear messaging about which step failed

### `actions.ts` (Server Actions)
- `fetchMembers(statusIds, page, search?)` — calls `memberService.getMembers()` with pagination and search
- `fetchStatusCounts(search?)` — calls `memberService.getStatusCounts()` with the same search term so tab counts reflect search results
- `fetchMemberStatuses()` — calls `memberService.getMemberStatuses()`
- `transitionMember(payload)` — derives milestone ID from `STATUS_TO_MILESTONE[newStatusId]`, calls `memberService.addMilestone()` → `memberService.attachFileToMilestone()` (if file) → `memberService.updateMemberStatus()`
- Follow the same `"use server"` pattern as `components/dashboard/actions.ts`

---

## 6. Service Layer

### `memberService.ts`

```typescript
// Follow singleton pattern like other services
// Use MPHelper for all API calls
// Use generated types: Participant, Contact, Member_Status, Contact_Milestone, Milestone
// Use Zod schemas for validation on writes: ContactMilestoneSchema, ParticipantSchema

class MemberService {
  async getMembers(options: {
    statusIds?: (number | null)[];  // filter by Member_Status_ID (null = no-status group)
    top?: number;                   // default 50
    skip?: number;                  // pagination offset
    search?: string;                // server-side search: matches Display_Name, Email_Address, Mobile_Phone (OR)
  }): Promise<{ members: MemberCard[]; total: number }>
  // Query Contacts with Participant_Record joins
  // Build filter dynamically: statusIds + search (Display_Name LIKE '%term%' OR Email_Address LIKE '%term%' OR Mobile_Phone LIKE '%term%')
  // Follow the same search filter construction as contactService.ts
  // Map to MemberCard DTO
  // Return total count for pagination

  async getStatusCounts(search?: string): Promise<Record<string, number>>
  // Lightweight query to get member counts per Member_Status_ID
  // MUST apply the same multi-field OR search filter so tab counts reflect search results
  // Used by tabs to always show accurate totals

  async getMemberStatuses(): Promise<MemberStatus[]>
  // Simple table query on Member_Statuses

  async addMilestone(data: TransitionPayload): Promise<number>
  // Derives Milestone_ID from newStatusId using STATUS_TO_MILESTONE mapping
  // For Dropped transitions (status 5–9), auto-prefixes Notes with the Member_Status name
  // POST to Contact_Milestones with Zod validation
  // Returns new Contact_Milestone_ID (needed for file attachment)

  async attachFileToMilestone(contactMilestoneId: number, file: File): Promise<void>
  // Upload file via File Service to Contact_Milestones record
  // Follow same pattern as Journeys/compliance pages

  async updateMemberStatus(participantId: number, newStatusId: number): Promise<void>
  // PUT to Participants with Zod validation (partial)
}
```

---

## 7. DTO Types

### `lib/dto/members.ts`

```typescript
export interface MemberCard {
  contactId: number;
  participantId: number;
  displayName: string;
  nickname: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  mobilePhone: string | null;
  memberStatusId: number | null;
  memberStatus: string | null;
  contactStatusId: number | null;
  fileUniqueId: string | null;  // dp_fileUniqueId for contact photo
}

export interface MemberStatusGroup {
  key: string;           // 'registered' | 'associate' | 'youth' | 'no-status' | 'dropped'
  label: string;
  statusIds: (number | null)[];  // which Member_Status_IDs belong to this group (null = no status)
  count: number;         // total members in this group (from server, not just current page)
}

export interface TransitionPayload {
  contactId: number;
  participantId: number;
  newStatusId: number;       // milestone ID is auto-derived from this via STATUS_TO_MILESTONE
  milestoneDate: string;     // ISO date
  notes?: string;            // auto-prefixed with dropped type name for Dropped transitions
  attachment?: File;         // optional file attachment
}
```

---

## 8. Implementation Order

Work in this order so each step is testable:

1. **DTO types** (`lib/dto/members.ts`) — define interfaces, add to barrel export in `lib/dto/index.ts`
2. **Service — read methods** (`services/memberService.ts`) — implement `getMembers` (with pagination params), `getStatusCounts`, `getMemberStatuses`. Define `MEMBERSHIP_JOURNEY_ID` and `STATUS_TO_MILESTONE` constants.
3. **Server actions — reads** (`components/manage-members/actions.ts`) — wire up data fetching with pagination
4. **Page + Shell + Pagination + Search** — get the page rendering with real data, tabs showing counts, paginated card grid, and server-side search with debounce. Search matches Display_Name, Email_Address, and Mobile_Phone. Search should update both the card results and tab counts. Follow the same search pattern as the contact lookup page (`src/components/contact-lookup/` and `src/services/contactService.ts`).
5. **MemberCard with photos** — render cards with contact photos from `dp_fileUniqueId` (follow existing photo pattern), fallback to initials avatar
6. **MemberTabs** — tab bar with counts from `getStatusCounts`, Dropped statuses merged
7. **TransitionDialog with file upload** — build the full form including attachment upload, wire up the write server action
8. **Service — write methods** — implement `addMilestone`, `attachFileToMilestone`, `updateMemberStatus`
9. **Permissions** — register the page in the MP permission structure, implement access control using the same user group model as other pages. Look at how existing pages (dashboard, contactlookup) check permissions and follow that pattern.
10. **Navigation** — add sidebar link
11. **Polish** — loading skeletons, error states, empty states ("no results" for search), optimistic UI updates after transitions

---

## 9. Resolved Decisions

- **Search:** Server-side, multi-field — matches Display_Name, Email_Address, and Mobile_Phone using OR logic. Follow the same implementation pattern as the contact lookup page (`src/components/contact-lookup/` and `src/services/contactService.ts`). Search applies to both the paginated member results and the tab counts.
- **Transition scope:** All statuses can transition to any other status, including restoring Dropped members. The TransitionDialog shows every status except the person's current one.
- **Pagination:** Server-side, 50 per page. Tab counts fetched separately so totals are always accurate.
- **Photos:** Contact photos rendered on cards using `dp_fileUniqueId` and `NEXT_PUBLIC_MINISTRY_PLATFORM_FILE_URL`. Follow the existing Journeys/compliance page pattern.
- **File attachments:** Supported on milestones. Use File Service upload after milestone creation. Follow the existing Journeys/compliance page pattern.
- **Permissions:** Register a new page in the MP permission structure. Use the same MP Security Role / user group access model as other pages in the app (dashboard, contactlookup, etc.). Look at how existing pages implement access checks and replicate.

## 10. Membership Journey Configuration

**Journey_ID:** 7

**Status → Milestone mapping (hardcode as a constant in the service or a shared config):**

```typescript
const MEMBERSHIP_JOURNEY_ID = 7;

const STATUS_TO_MILESTONE: Record<number, number> = {
  1: 48,   // Registered Member
  4: 51,   // Associate Membership
  10: 52,  // Youth Membership
  // All Dropped statuses (5, 6, 7, 8, 9) → Milestone 49
  5: 49, 6: 49, 7: 49, 8: 49, 9: 49,
};
```

**Dropped notes rule:** When creating a milestone for any Dropped transition, auto-prefix the Notes field with the specific Member_Status name from the target status. Format: `"Dropped-Death"` or `"Dropped-Transferred: user's additional notes here"` (colon + space separator if the user adds notes).

---

## 11. Conventions Reminder

- Use `@/*` path aliases for all imports
- kebab-case for all files and folders
- Named exports, no default exports
- Server Components by default, `"use client"` only when needed
- Use shadcn/ui components (Card, Tabs, Dialog, Button, Input, Select, etc.)
- Use Zod schemas for write validation (`ContactMilestoneSchema`, `ParticipantSchema`)
- Follow the singleton service pattern
- Don't edit generated files in `models/` — use them via imports