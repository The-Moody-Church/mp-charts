# RBAC Implementation Plan

**Issue**: [#58 — Role-Based Access Control](https://github.com/The-Moody-Church/mp-charts/issues/58)
**Date**: 2026-02-26
**Status**: Plan — awaiting implementation

## Problem

All authenticated users have identical access to all features and data. The proxy only checks session cookie presence. Any church member with MP OAuth access can view volunteer background checks, baptism applicant data, membership records, and the executive dashboard.

## Foundation (completed)

Upstream PR #50 incorporated — `MPUserProfile` now loads `roles` (from `dp_User_Roles`) and `userGroups` (from `dp_User_User_Groups`) at login via `UserService.getUserProfile()`. This data is available through the `useUser()` context on the client and can be fetched server-side in actions.

## Architecture Decision

**Approach: Server-action authorization + client-side UI gating**

- **Server actions** are the enforcement boundary — every action checks roles before data access
- **Client UI** hides features the user can't access (sidebar, home page cards) — this is UX polish, not security
- **Proxy** stays unchanged (session presence only) — role checks in the proxy would require a DB lookup on every request, adding latency; server actions already run per-operation

Why not per-user access tokens? That's a bigger architectural change (token refresh, per-request MPHelper instances, MP permission model alignment). It could be a future enhancement but RBAC via roles is simpler, gives us explicit control, and addresses the immediate security gap.

## Role-to-Feature Mapping

Define a central config mapping MP roles/groups to features. This avoids scattering role names across server actions.

```typescript
// src/lib/authorization.ts

export type Feature =
  | "dashboard"
  | "volunteer-processing"
  | "baptism-processing"
  | "membership-processing"
  | "contact-lookup"
  | "contact-logs";

// Map features to the MP roles OR userGroups that grant access.
// A user needs at least one matching role or group for the feature.
export const FEATURE_ACCESS: Record<Feature, { roles: string[]; userGroups: string[] }> = {
  "dashboard": {
    roles: ["Administrators"],
    userGroups: ["Dashboard Viewers"],  // example — TBD based on actual MP setup
  },
  "volunteer-processing": {
    roles: ["Administrators"],
    userGroups: ["Volunteer Coordinators"],
  },
  "baptism-processing": {
    roles: ["Administrators"],
    userGroups: ["Baptism Coordinators"],
  },
  "membership-processing": {
    roles: ["Administrators"],
    userGroups: ["Membership Coordinators"],
  },
  "contact-lookup": {
    roles: ["Administrators"],
    userGroups: [],
  },
  "contact-logs": {
    roles: ["Administrators"],
    userGroups: ["Pastoral Staff"],
  },
};
```

**Important**: The exact role and group names must be confirmed against the actual Ministry Platform configuration. The names above are placeholders — the real names come from `dp_User_Roles.Role_Name` and `dp_User_User_Groups.User_Group_Name`.

## Implementation Steps

### Phase 1: Authorization Infrastructure

**1a. Create `src/lib/authorization.ts`**

Central module with:
- `Feature` type and `FEATURE_ACCESS` config (as above)
- `hasFeatureAccess(profile: MPUserProfile, feature: Feature): boolean` — checks if user's roles/groups match
- `requireFeatureAccess(feature: Feature): Promise<void>` — server-side check that fetches profile and throws if unauthorized

```typescript
export function hasFeatureAccess(
  profile: { roles: string[]; userGroups: string[] },
  feature: Feature
): boolean {
  const access = FEATURE_ACCESS[feature];
  return (
    profile.roles.some((r) => access.roles.includes(r)) ||
    profile.userGroups.some((g) => access.userGroups.includes(g))
  );
}

export async function requireFeatureAccess(feature: Feature): Promise<void> {
  const session = await requireSession();
  const userGuid = getUserGuid(session);
  if (!userGuid) throw new Error("Unauthorized");

  const userService = await UserService.getInstance();
  const profile = await userService.getUserProfile(userGuid);
  if (!profile || !hasFeatureAccess(profile, feature)) {
    throw new Error("Forbidden: insufficient permissions");
  }
}
```

**Performance note**: `requireFeatureAccess` makes 3 MP API calls (user lookup + roles + groups) per server action invocation. Options to mitigate:
- Cache the profile in-memory per user for a short TTL (e.g., 5 minutes)
- Or accept the overhead since these are lightweight lookups and server actions are already rate-limited

**1b. Add caching to `UserService.getUserProfile`**

Add a short-lived in-memory cache (Map with TTL) keyed by user GUID:

```typescript
private profileCache = new Map<string, { profile: MPUserProfile; expiresAt: number }>();
private static CACHE_TTL = 5 * 60 * 1000; // 5 minutes
```

This ensures repeated `requireFeatureAccess` calls within a session don't re-query MP every time.

### Phase 2: Server-Side Enforcement

Add `requireFeatureAccess(feature)` to every server action. This is the actual security boundary.

| File | Feature | Actions to protect |
|------|---------|-------------------|
| `src/components/dashboard/actions.ts` | `"dashboard"` | All 5 actions |
| `src/components/volunteer-processing/actions.ts` | `"volunteer-processing"` | All 13 actions |
| `src/components/baptism-processing/actions.ts` | `"baptism-processing"` | All 10 actions |
| `src/components/membership-processing/actions.ts` | `"membership-processing"` | All 8 actions |
| `src/components/contact-lookup/actions.ts` | `"contact-lookup"` | `searchContacts()` |
| `src/components/contact-lookup-details/actions.ts` | `"contact-lookup"` | Both actions |
| `src/components/contact-logs/actions.ts` | `"contact-logs"` | All 6 actions |

**Pattern per action:**
```typescript
export async function getInProcessVolunteers() {
  "use server";
  await requireFeatureAccess("volunteer-processing");
  // ... existing logic
}
```

**Note**: `requireFeatureAccess` calls `requireSession()` internally, so we can replace the existing `requireSession()` call in each action (not add a second one).

### Phase 3: Client-Side UI Gating

**3a. Create `useAuthorization` hook**

```typescript
// src/hooks/use-authorization.ts
import { useUser } from "@/contexts";
import { hasFeatureAccess, Feature } from "@/lib/authorization";

export function useAuthorization() {
  const { userProfile } = useUser();

  return {
    canAccess: (feature: Feature) =>
      userProfile ? hasFeatureAccess(userProfile, feature) : false,
  };
}
```

**3b. Gate sidebar nav items**

In `sidebar.tsx`, conditionally render nav items:

```tsx
const { canAccess } = useAuthorization();

// Only show items the user can access
const visibleItems = navItems.filter((item) => {
  if (item.devOnly && !isDev) return false;
  if (item.feature && !canAccess(item.feature)) return false;
  return true;
});
```

**3c. Gate home page cards**

Same pattern in `page.tsx` — hide cards for features the user can't access. Since home page is a Server Component, this would need to either:
- Become a client component (simple but loses SSR)
- Or pass authorized features as props from a server-side check

Recommended: wrap just the card grid in a client component that uses `useAuthorization()`.

### Phase 4: Unauthorized Access UX

When a user navigates directly to a URL they don't have access to (e.g., bookmarked `/volunteer-processing`):

- Server actions will throw "Forbidden" errors
- Add a generic "Access Denied" error boundary or page that catches these and shows a friendly message
- Consider a redirect to home with a toast notification

### Phase 5: Testing

| Test | What it verifies |
|------|-----------------|
| `authorization.test.ts` | `hasFeatureAccess` logic with various role/group combinations |
| `authorization.test.ts` | `requireFeatureAccess` throws for unauthorized users |
| Update each `actions.test.ts` | Actions reject when user lacks required role |
| `sidebar.test.tsx` | Nav items filtered by role |

## File Changes Summary

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/authorization.ts` | **New** | Feature access config, `hasFeatureAccess`, `requireFeatureAccess` |
| `src/hooks/use-authorization.ts` | **New** | `useAuthorization` hook for client-side gating |
| `src/services/userService.ts` | **Modify** | Add profile cache with TTL |
| `src/components/dashboard/actions.ts` | **Modify** | Add `requireFeatureAccess("dashboard")` |
| `src/components/volunteer-processing/actions.ts` | **Modify** | Add `requireFeatureAccess("volunteer-processing")` |
| `src/components/baptism-processing/actions.ts` | **Modify** | Add `requireFeatureAccess("baptism-processing")` |
| `src/components/membership-processing/actions.ts` | **Modify** | Add `requireFeatureAccess("membership-processing")` |
| `src/components/contact-lookup/actions.ts` | **Modify** | Add `requireFeatureAccess("contact-lookup")` |
| `src/components/contact-lookup-details/actions.ts` | **Modify** | Add `requireFeatureAccess("contact-lookup")` |
| `src/components/contact-logs/actions.ts` | **Modify** | Add `requireFeatureAccess("contact-logs")` |
| `src/components/layout/sidebar.tsx` | **Modify** | Filter nav items by feature access |
| `src/app/(web)/page.tsx` | **Modify** | Gate home page cards by feature access |
| `src/lib/authorization.test.ts` | **New** | Tests for authorization logic |

## Open Questions

1. **What are the actual MP role and group names?** The `FEATURE_ACCESS` config needs real names from Ministry Platform's `dp_User_Roles` and `dp_User_User_Groups` tables. We could log/display the current user's roles during dev to discover them.
2. **Should "Administrators" have blanket access?** The plan assumes yes — Administrators role grants access to everything. Confirm this is the desired behavior.
3. **Should unauthorized users see a disabled nav item or no item at all?** Plan assumes hidden (no item). An alternative is greyed-out with a tooltip explaining why.
4. **Dashboard access**: Should the dashboard be open to all authenticated users or restricted? It shows aggregate data (not PII), so broader access may be appropriate.
5. **Profile cache TTL**: 5 minutes means role changes take up to 5 minutes to take effect. Is this acceptable?

## Relationship to #57 (IDOR Mitigation)

RBAC reduces IDOR surface area by restricting *who can reach* record-accessing endpoints. However, RBAC alone doesn't solve IDOR — a user with "Volunteer Coordinator" role could still enumerate volunteer IDs to access records from groups they don't manage. Full IDOR mitigation requires per-record checks (Phase 2 of a separate effort) or per-user access tokens.
