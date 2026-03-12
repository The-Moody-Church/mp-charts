# Plan: Contact-Lookup Member Badges Should Specify Type (#85)

## Problem

The contact lookup badges currently show a generic "Member" label instead of the specific membership type (e.g., "Registered Member", "Associate Member", "Youth Member", "Dropped Member"). Additionally, the search results list shows no membership badges at all despite having the data available.

## Current State

### Data Flow
- `ContactSearch` DTO already has `Member_Status` (string) and `Member_Status_ID` (number) fields
- `getAllContactsForSearch()` in `contactService.ts` joins through `Participant_Record_Table_Member_Status_ID_Table.[Member_Status]` — so the specific status name IS fetched from MP
- `getContactBadges()` also fetches `Member_Status_ID_Table.[Member_Status]` from the Participants table

### Rendering
- **Search results** (`contact-lookup-results.tsx`): No badges shown — only name, email, phone
- **Detail page** (`contact-lookup-details/contact-lookup-details.tsx`): Shows `badges.membershipStatus` with color via `statusBadgeColor(badges.membershipStatusId)`. Colors mapped for IDs 1, 4, 5–9, 10

### Key Question
The `Member_Status` string comes directly from Ministry Platform's `Member_Status` lookup table. If MP returns "Member" for status ID 1 (rather than "Registered Member"), we'd need to either:
1. Add a client-side label override map (simplest, no MP schema change)
2. Or confirm the MP data already returns specific names like "Registered Member"

## Implementation Plan

### Step 1: Add Member Status Badges to Search Results

**File: `src/components/contact-lookup/contact-lookup-results.tsx`**

- Import the `statusBadgeColor` helper (extract it to a shared utility or inline it)
- In the result card, after the name line and before email/phone, render a badge when `contact.Member_Status` is truthy:
  ```tsx
  {contact.Member_Status && (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeColor(contact.Member_Status_ID)}`}>
      {contact.Member_Status}
    </span>
  )}
  ```

### Step 2: Extract `statusBadgeColor` to Shared Utility

**File: `src/lib/contact-badge-utils.ts`** (new)

Move `statusBadgeColor` from `contact-lookup-details.tsx` to a shared utility so both the search results and detail page use the same color logic:

```typescript
export function statusBadgeColor(statusId: number | null): string {
  switch (statusId) {
    case 1: return "bg-green-100 text-green-800";       // Registered Member
    case 4: return "bg-blue-100 text-blue-800";          // Associate Member
    case 10: return "bg-purple-100 text-purple-800";     // Youth Member
    case 5: case 6: case 7: case 8: case 9:
      return "bg-red-100 text-red-800";                  // Dropped/inactive statuses
    default: return "bg-gray-100 text-gray-800";
  }
}
```

Update both `contact-lookup-results.tsx` and `contact-lookup-details.tsx` to import from this shared location.

### Step 3: Verify Member Status Labels (May Not Need Code Changes)

The `Member_Status` string comes directly from MP. If the MP lookup table already has "Registered Member", "Associate Member", etc., then no mapping is needed — the badge will show the correct label automatically.

**If MP returns generic "Member"** for status ID 1, add a display label map:

```typescript
const MEMBER_STATUS_LABELS: Record<number, string> = {
  1: "Registered Member",
  // Add other overrides as needed
};

export function getMemberStatusLabel(statusId: number | null, mpLabel: string | null): string | null {
  if (statusId == null || !mpLabel) return mpLabel;
  return MEMBER_STATUS_LABELS[statusId] ?? mpLabel;
}
```

This step may be unnecessary if MP already returns specific labels — needs verification at runtime.

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `src/lib/contact-badge-utils.ts` | **Create** | Shared `statusBadgeColor` + optional label mapping |
| `src/components/contact-lookup/contact-lookup-results.tsx` | **Modify** | Add member status badge to search result cards |
| `src/components/contact-lookup-details/contact-lookup-details.tsx` | **Modify** | Import `statusBadgeColor` from shared util instead of local |

## Security Review

- No new filter parameters or user input interpolation
- No new server actions or endpoints
- No PII logging changes
- Read-only display change using already-fetched data
- **Checklist**: All critical/high items pass — no changes to security boundaries

## Scope

This is a small, focused change:
- Add ~10 lines to search results for badge rendering
- Extract ~10 lines to a shared utility
- Update 1 import in the detail page
- Optionally add a label map if MP returns generic names
