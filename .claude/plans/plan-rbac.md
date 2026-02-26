# RBAC Implementation Plan

**Issue**: [#58 — Role-Based Access Control](https://github.com/The-Moody-Church/mp-charts/issues/58)
**Date**: 2026-02-26
**Status**: Plan — awaiting implementation

## Problem

All authenticated users have identical access to all features and data. The proxy only checks session cookie presence. Any church member with MP OAuth access can view volunteer background checks, baptism applicant data, membership records, and the executive dashboard.

## Foundation (completed)

Upstream PR #50 incorporated — `MPUserProfile` now loads `roles` (from `dp_User_Roles`) and `userGroups` (from `dp_User_User_Groups`) at login via `UserService.getUserProfile()`. This data is available through the `useUser()` context on the client and can be fetched server-side in actions.

## Architecture Decision

**Approach: Admin-managed feature-to-User-Group mapping + server-action enforcement + client-side UI gating**

### Core Concepts

1. **Features** are the app's protected areas (dashboard, volunteer-processing, baptism-processing, etc.)
2. **User Groups** (from `dp_User_User_Groups`) gate access — each feature has a list of allowed User Group IDs
3. **Super-admin group(s)** defined in `.env` (`ADMIN_USER_GROUP_IDS`) always have access to everything, including the admin tool itself
4. **Admin page** at `/admin` lets super-admins manage which User Group IDs are allowed for each feature
5. **Server actions** are the security boundary — every action checks the user's group memberships against the feature's allowed groups
6. **Client UI** hides features the user can't access (sidebar, home page cards) — UX polish, not security
7. **Proxy** stays unchanged (session presence only)

### Why User Group IDs (not names)?

- IDs are stable — group names can be renamed in MP without breaking authorization
- IDs are numeric, easy to store and compare
- The `dp_User_User_Groups` table has `User_Group_ID` as the foreign key — we need to add this to the profile fetch

### Why an admin page (not hardcoded config)?

- Feature-to-group mappings change as staff roles evolve — no code deploy needed
- Church admins can self-service without developer involvement
- The mapping is stored in a simple config (JSON file or DB table) that persists across deploys

## Data Model Changes

### MPUserProfile — add User Group IDs

Currently we fetch group *names*. We also need group *IDs* for authorization checks:

```typescript
export interface MPUserProfile {
  // ... existing fields ...
  roles: string[];
  userGroups: string[];
  userGroupIds: number[];  // NEW — User_Group_IDs for authorization
}
```

Update `UserService.getUserProfile` to also select `User_Group_ID` from `dp_User_User_Groups`:

```typescript
// Current select: "User_Group_ID_TABLE.User_Group_Name"
// New select:     "User_Group_ID, User_Group_ID_TABLE.User_Group_Name"
```

### Environment Variable

```env
# Super-admin User Group IDs — comma-separated list
# Users in ANY of these groups have access to ALL features including the admin page
# User Group ID 29 = Administrators (example)
ADMIN_USER_GROUP_IDS=29
```

This is an `IN`-style list — multiple IDs can be specified (e.g., `29,42`). A user matching ANY of these groups is a super-admin.

### Feature Access Configuration

Stored as a JSON structure (initially loaded from a config file, later manageable via admin UI):

```typescript
// src/lib/authorization.ts

export type Feature =
  | "dashboard"
  | "volunteer-processing"
  | "baptism-processing"
  | "membership-processing"
  | "contact-lookup"
  | "contact-logs"
  | "admin";

interface FeatureAccessConfig {
  [feature: string]: {
    label: string;           // Display name for admin UI
    description: string;     // What this feature does
    allowedGroupIds: number[]; // User Group IDs that can access this feature
  };
}
```

### Storage Strategy

**Phase 1 (MVP)**: Store feature-group mappings in a JSON file on disk (`data/feature-access.json`). Simple, no DB dependency, works with Docker volumes.

**Phase 2 (future)**: If Ministry Platform has a suitable config table, migrate there for centralized management.

```json
// data/feature-access.json
{
  "dashboard": {
    "label": "Executive Dashboard",
    "description": "View ministry metrics and attendance data",
    "allowedGroupIds": [29, 45]
  },
  "volunteer-processing": {
    "label": "Volunteer Processing",
    "description": "Manage volunteer onboarding and approvals",
    "allowedGroupIds": [29, 52]
  },
  "baptism-processing": {
    "label": "Baptism Processing",
    "description": "Manage baptism applicants and milestones",
    "allowedGroupIds": [29, 53]
  },
  "membership-processing": {
    "label": "Membership Processing",
    "description": "Manage membership applications",
    "allowedGroupIds": [29, 54]
  },
  "contact-lookup": {
    "label": "Contact Lookup",
    "description": "Search and view contact records",
    "allowedGroupIds": [29]
  },
  "contact-logs": {
    "label": "Contact Logs",
    "description": "Create and manage pastoral contact logs",
    "allowedGroupIds": [29]
  }
}
```

**Note**: The `admin` feature is NOT stored in the config file — it's exclusively gated by `ADMIN_USER_GROUP_IDS` from `.env`. This prevents admins from accidentally locking themselves out.

## Implementation Steps

### Phase 1: Authorization Infrastructure

**1a. Update `MPUserProfile` and `UserService`**

Add `userGroupIds: number[]` to the interface and update `getUserProfile` to also select `User_Group_ID` from the groups query.

**1b. Create `src/lib/authorization.ts`**

Central module with:

```typescript
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const CONFIG_PATH = join(process.cwd(), "data", "feature-access.json");

// Parse ADMIN_USER_GROUP_IDS from .env (comma-separated)
function getAdminGroupIds(): number[] {
  const raw = process.env.ADMIN_USER_GROUP_IDS || "";
  return raw.split(",").map(Number).filter((n) => !isNaN(n) && n > 0);
}

// Check if user is a super-admin
export function isSuperAdmin(userGroupIds: number[]): boolean {
  const adminIds = getAdminGroupIds();
  return userGroupIds.some((id) => adminIds.includes(id));
}

// Load feature access config from disk
export function loadFeatureAccess(): FeatureAccessConfig { ... }

// Save feature access config to disk
export function saveFeatureAccess(config: FeatureAccessConfig): void { ... }

// Check if user can access a feature
export function hasFeatureAccess(
  userGroupIds: number[],
  feature: Feature
): boolean {
  // Super-admins can access everything
  if (isSuperAdmin(userGroupIds)) return true;

  // "admin" feature is super-admin only
  if (feature === "admin") return false;

  const config = loadFeatureAccess();
  const featureConfig = config[feature];
  if (!featureConfig) return false;

  return userGroupIds.some((id) => featureConfig.allowedGroupIds.includes(id));
}

// Server-side enforcement — throws if unauthorized
export async function requireFeatureAccess(feature: Feature): Promise<Session> {
  const session = await requireSession();
  const userGuid = getUserGuid(session);
  if (!userGuid) throw new Error("Unauthorized");

  const userService = await UserService.getInstance();
  const profile = await userService.getUserProfile(userGuid);
  if (!profile || !hasFeatureAccess(profile.userGroupIds, feature)) {
    throw new Error("Forbidden: insufficient permissions");
  }
  return session;
}
```

**1c. Add `ADMIN_USER_GROUP_IDS` to `.env.example`**

```env
# RBAC Configuration
# Super-admin User Group IDs — comma-separated
# Users in ANY of these groups have full access to all features + admin page
ADMIN_USER_GROUP_IDS=29
```

**1d. Add profile caching to `UserService`**

Short-lived in-memory cache (5-min TTL) keyed by user GUID to avoid 3 MP API calls per server action:

```typescript
private profileCache = new Map<string, { profile: MPUserProfile; expiresAt: number }>();
private static CACHE_TTL = 5 * 60 * 1000; // 5 minutes
```

### Phase 2: Server-Side Enforcement

Replace `requireSession()` with `requireFeatureAccess(feature)` in every server action. `requireFeatureAccess` calls `requireSession()` internally.

| File | Feature | Actions to protect |
|------|---------|-------------------|
| `src/components/dashboard/actions.ts` | `"dashboard"` | All 5 actions |
| `src/components/volunteer-processing/actions.ts` | `"volunteer-processing"` | All 13 actions |
| `src/components/baptism-processing/actions.ts` | `"baptism-processing"` | All 10 actions |
| `src/components/membership-processing/actions.ts` | `"membership-processing"` | All 8 actions |
| `src/components/contact-lookup/actions.ts` | `"contact-lookup"` | `searchContacts()` |
| `src/components/contact-lookup-details/actions.ts` | `"contact-lookup"` | Both actions |
| `src/components/contact-logs/actions.ts` | `"contact-logs"` | All 6 actions |

**Pattern:**
```typescript
export async function getInProcessVolunteers() {
  "use server";
  const session = await requireFeatureAccess("volunteer-processing");
  const mpUserId = getMpUserId(session);
  // ... existing logic using session/mpUserId
}
```

### Phase 3: Admin Page

**Route**: `/admin` (production-visible, but gated to super-admins only)

**UI**: A simple page listing all features. Each feature shows:
- Feature name and description
- A multi-select of User Groups (fetched from `dp_User_User_Groups` or a known list)
- Save button that writes to `data/feature-access.json`

**Components**:
- `src/app/(web)/admin/page.tsx` — Suspense wrapper
- `src/components/admin/admin-page.tsx` — client component with the form
- `src/components/admin/actions.ts` — server actions:
  - `getFeatureAccessConfig()` — reads config (requires `"admin"` feature access)
  - `updateFeatureAccess(feature, allowedGroupIds)` — writes config
  - `getAvailableUserGroups()` — fetches all User Groups from MP for the picker

**Admin is always gated by `ADMIN_USER_GROUP_IDS`** — not by the feature-access config file. This is a safety measure: the admin page cannot be used to lock out admins.

### Phase 4: Client-Side UI Gating

**4a. Create `useAuthorization` hook**

```typescript
// src/hooks/use-authorization.ts
import { useUser } from "@/contexts";
import { hasFeatureAccess, Feature } from "@/lib/authorization";

export function useAuthorization() {
  const { userProfile } = useUser();

  return {
    canAccess: (feature: Feature) =>
      userProfile ? hasFeatureAccess(userProfile.userGroupIds, feature) : false,
    isSuperAdmin: userProfile ? isSuperAdmin(userProfile.userGroupIds) : false,
  };
}
```

**Note**: `hasFeatureAccess` reads the config file server-side. For client-side usage, we need to either:
- Expose the user's accessible features as a list via a server action called once at login
- Or move the check to a server action that the hook calls

Recommended: add a `getAccessibleFeatures(userGuid)` server action that returns `Feature[]`, called by `UserProvider` alongside `getCurrentUserProfile`. Store in context so `useAuthorization` is synchronous.

**4b. Gate sidebar and home page**

```tsx
// sidebar.tsx
const { canAccess, isSuperAdmin } = useAuthorization();

const visibleItems = navItems.filter((item) => {
  if (item.devOnly && !isDev) return false;
  if (item.feature && !canAccess(item.feature)) return false;
  if (item.adminOnly && !isSuperAdmin) return false;
  return true;
});
```

Add admin link to sidebar (only visible to super-admins).

### Phase 5: Unauthorized Access UX

When a user navigates directly to a URL they don't have access to:

- Server actions throw "Forbidden" errors
- Add an error boundary that catches authorization errors and shows a friendly "Access Denied" message
- Consider redirect to home with a toast notification

### Phase 6: Testing

| Test | What it verifies |
|------|-----------------|
| `authorization.test.ts` | `hasFeatureAccess` with various group ID combinations |
| `authorization.test.ts` | `isSuperAdmin` with env var parsing |
| `authorization.test.ts` | `requireFeatureAccess` throws for unauthorized users |
| `authorization.test.ts` | Config file read/write |
| Update each `actions.test.ts` | Actions reject when user lacks required group |
| `admin/actions.test.ts` | Admin actions gated to super-admins |

## File Changes Summary

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/providers/ministry-platform/types/user-profile.types.ts` | **Modify** | Add `userGroupIds: number[]` |
| `src/services/userService.ts` | **Modify** | Select `User_Group_ID` in groups query, add profile cache |
| `src/lib/authorization.ts` | **New** | Feature type, config loading, `hasFeatureAccess`, `isSuperAdmin`, `requireFeatureAccess` |
| `data/feature-access.json` | **New** | Default feature-to-group config |
| `.env.example` | **Modify** | Add `ADMIN_USER_GROUP_IDS` |
| `src/hooks/use-authorization.ts` | **New** | `useAuthorization` hook for client-side gating |
| `src/app/(web)/admin/page.tsx` | **New** | Admin page route |
| `src/components/admin/admin-page.tsx` | **New** | Admin UI component |
| `src/components/admin/actions.ts` | **New** | Admin server actions |
| `src/components/admin/index.ts` | **New** | Barrel export |
| `src/components/dashboard/actions.ts` | **Modify** | Replace `requireSession()` with `requireFeatureAccess("dashboard")` |
| `src/components/volunteer-processing/actions.ts` | **Modify** | Replace `requireSession()` with `requireFeatureAccess("volunteer-processing")` |
| `src/components/baptism-processing/actions.ts` | **Modify** | Replace `requireSession()` with `requireFeatureAccess("baptism-processing")` |
| `src/components/membership-processing/actions.ts` | **Modify** | Replace `requireSession()` with `requireFeatureAccess("membership-processing")` |
| `src/components/contact-lookup/actions.ts` | **Modify** | Replace `requireSession()` with `requireFeatureAccess("contact-lookup")` |
| `src/components/contact-lookup-details/actions.ts` | **Modify** | Replace `requireSession()` with `requireFeatureAccess("contact-lookup")` |
| `src/components/contact-logs/actions.ts` | **Modify** | Replace `requireSession()` with `requireFeatureAccess("contact-logs")` |
| `src/components/layout/sidebar.tsx` | **Modify** | Filter nav items by feature access, add admin link |
| `src/app/(web)/page.tsx` | **Modify** | Gate home page cards by feature access |
| `src/lib/authorization.test.ts` | **New** | Tests for authorization logic |

## Open Questions

1. **Config storage for Docker**: `data/feature-access.json` needs to persist across container restarts. Options: Docker volume mount on `data/`, or store in MP as a config record. Volume mount is simplest for Phase 1.
2. **Should unauthorized users see a disabled nav item or no item at all?** Plan assumes hidden. An alternative is greyed-out with a tooltip.
3. **Dashboard access**: Should the dashboard be open to all authenticated users or restricted? It shows aggregate data (not PII), so broader access may be appropriate.
4. **Profile cache TTL**: 5 minutes means group changes take up to 5 minutes to take effect. Is this acceptable?
5. **User Group picker in admin UI**: Should it fetch all groups from MP dynamically, or show a fixed list based on what exists in the current config?

## Relationship to #57 (IDOR Mitigation)

RBAC reduces IDOR surface area by restricting *who can reach* record-accessing endpoints. However, RBAC alone doesn't solve IDOR — a user in a "Volunteer Coordinators" group could still enumerate volunteer IDs to access records from groups they don't manage. Full IDOR mitigation requires per-record checks (Phase 2 of a separate effort) or per-user access tokens.
