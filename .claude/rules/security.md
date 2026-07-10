# Security Best Practices

This project handles **PII** (names, emails, phones, dates of birth, background check data). All code must follow these security practices. These rules apply during development — catch issues at write time, not in review.

## Ministry Platform Data Safety — MANDATORY

**NEVER delete, update, or create records in Ministry Platform without explicit user confirmation first.** No exceptions — not agents, scripts, "cleanup" operations, or "it's just one record."

Ministry Platform is a shared production database containing real church member data — contacts, communications, subscriptions, donations, groups, events. Unauthorized writes can affect thousands of people.

**Before ANY write operation** (`deleteTableRecords`, `updateTableRecords`, `createTableRecords`, stored procedures that mutate state, or any HTTP `POST`/`PUT`/`DELETE` to the MP API):

1. **Stop.** Do not execute the operation.
2. **Show the user** exactly what will be affected: the table name, the record IDs, the fields that will change, and the old → new values where applicable.
3. **Wait for the user to explicitly say yes** before proceeding.
4. If the user says no, do not retry or suggest alternatives unless asked.

**Read-only operations are always fine** — `getTableRecords`, `GET` requests. Only writes require confirmation.

This rule applies to all agents, subagents, scripts, hooks, and scheduled tasks. **There are zero exceptions.**

## Filter & Query Safety

Ministry Platform's REST API accepts OData-style `$filter` parameters that map to SQL WHERE clauses. **Never interpolate raw strings into filters.**

```typescript
import { sanitizeFilterValue, sanitizeIds, sanitizeGuid } from "@/lib/providers/ministry-platform/utils/filter-sanitize";

// LIKE clauses — escape single quotes
const safe = sanitizeFilterValue(userInput);
filter: `Last_Name LIKE '%${safe}%'`

// IN clauses — validate all IDs are finite positive numbers
filter: `Contact_ID IN (${sanitizeIds(ids)})`

// GUID values — validate format before interpolation
const validGuid = sanitizeGuid(guid);
filter: `Contact_GUID = '${validGuid}'`
```

**Anti-patterns — NEVER do these:**
```typescript
filter: `Last_Name LIKE '%${search}%'`          // breaks on O'Brien, injectable
filter: `Contact_ID IN (${ids.join(',')})`       // no numeric validation
filter: `User_GUID = '${profile.sub}'`           // no format validation
```

**Rule**: Every string interpolated into a `filter:` parameter MUST pass through a sanitization function from `filter-sanitize.ts`. This applies to:
- User search input -> `sanitizeFilterValue()`
- Arrays of IDs (even from DB results) -> `sanitizeIds()` or `sanitizeIdsOptional()`
- GUIDs (even from trusted sources like OIDC) -> `sanitizeGuid()`

### CI Enforcement

The CI workflow includes a `security-lint` job that greps for `.join(` near `filter` patterns in TypeScript source files. This catches the most common anti-pattern (using `.join(",")` instead of `sanitizeIds()` in filter `IN (...)` clauses). The check runs on every push and PR to `main`.

If you need `.join()` in a non-filter context and it triggers a false positive, add a `// filter-safety-ignore` comment on the same line.

## File Upload Validation

All file upload endpoints must validate MIME type **and** file size on the server side. Limits match Ministry Platform: **20 MB max**, standard file formats (PNG, JPG, BMP, GIF, PDF, TXT, CSV):

```typescript
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/webp'];
const ALLOWED_DOCUMENT_TYPES = [...ALLOWED_IMAGE_TYPES, 'application/pdf', 'text/plain', 'text/csv'];

// Validate before processing
if (!ALLOWED_DOCUMENT_TYPES.includes(file.type)) {
  return { success: false, error: `Invalid file type: ${file.type}` };
}
```

## URL & Redirect Safety

Never use user-supplied URLs for redirects without validation:

Do **not** validate with string-prefix checks like `startsWith("//")` / `includes("://")` — they miss the backslash bypass: browsers normalize `\` to `/`, so `"/\evil.com"` passes those checks yet navigates off-site. Resolve against your own origin and require it to stay same-origin:

```typescript
// Validate callback URLs are same-origin (client component — uses window.location)
function getSafeCallbackUrl(url: string | null): string {
  if (!url) return "/";
  // Reject backslashes and control chars first (browsers normalize "\" to "/").
  if (/[\\\x00-\x1f]/.test(url)) return "/";
  try {
    const resolved = new URL(url, window.location.origin);
    if (resolved.origin !== window.location.origin) return "/";
    return resolved.pathname + resolved.search + resolved.hash;
  } catch {
    return "/";
  }
}
```

## Logging & PII

**Never log PII in production.** This includes contact records, emails, phone numbers, notes, and any data from Ministry Platform tables that contain personal information.

```typescript
// Log operation context, not data
console.error("Error updating contact:", error);

// Gate verbose logging behind NODE_ENV
if (process.env.NODE_ENV === 'development') {
  console.log("Debug:", data);
}

// NEVER log PII
console.log("Contact:", JSON.stringify(record));         // leaks email, phone
console.log("HTTP PUT:", JSON.stringify(body, null, 2)); // leaks request payloads
```

## Authentication & Authorization

- Every server action MUST call `requireSession()` before any data access
- Use `getMpUserId(session)` for audit attribution on write operations
- The proxy (`src/proxy.ts`) protects routes but only checks session presence — it does not check roles
- IDOR risk: server actions accept record IDs from clients without per-record authorization. When adding new endpoints that access sensitive data, consider whether the requesting user should have access to that specific record

## Security Headers

Security headers are configured in `next.config.ts` via the `headers()` function. When modifying, ensure these headers remain present:
- `X-Frame-Options: DENY` — prevents clickjacking
- `X-Content-Type-Options: nosniff` — prevents MIME sniffing
- `Strict-Transport-Security` — enforces HTTPS
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` — disables unused browser APIs

## Rate Limiting

Server actions are rate-limited per authenticated user via `src/lib/rate-limit.ts` (in-memory sliding window). The general limit is enforced automatically in `requireSession()`; stricter tiers must be called explicitly with `enforceRateLimit()`:

```typescript
import { enforceRateLimit } from "@/lib/rate-limit";

// In a write server action:
const session = await requireSession(); // auto-enforces "general" (120/min)
enforceRateLimit(session.user.id, "write"); // explicit stricter limit (30/min)
```

| Tier | Limit | Window | Applied to |
|------|-------|--------|------------|
| `general` | 120 req | 1 min | All server actions (via `requireSession()`) |
| `write` | 30 req | 1 min | Create/update/delete operations |
| `upload` | 10 req | 10 min | Photo and document uploads |
| `search` | 30 req | 1 min | Contact search (PII access) |
| `cacheRefresh` | 5 req | 1 hour | Dashboard cache invalidation |

When adding new server actions:
- **Read-only actions**: No extra work — `requireSession()` handles the general limit
- **Write actions**: Add `enforceRateLimit(session.user.id, "write")` after `requireSession()`
- **File uploads**: Add `enforceRateLimit(session.user.id, "upload")` after `requireSession()`

## Security Audit Reference

The full security audit report is at `.claude/notes/security-audit-2026-02-24.md`. It documents all 15 findings, their status, and remaining open items (RBAC, IDOR mitigation).

Pre-PR security review checklist: `.claude/notes/security-review-checklist.md`
