# Security Audit Report — 2026-05-21

> **Superseded by [`security-audit-2026-06-23.md`](security-audit-2026-06-23.md).** This report was
> authored on the never-merged branch `claude/review-mpnext-upstream-7Asdf` and landed in main on
> 2026-09-01 as historical record, once every finding in it was fixed or superseded. Two claims are
> corrected below as editor's notes: the #17 impact statement (better-auth ≥1.6 does not fall back to
> a default secret in production — it throws, though only at first request) and the finding-#1 /
> "Positive Findings" descriptions of `sanitizeLikeValue` + `LIKE_ESCAPE_CLAUSE` (that backslash-escape
> implementation never merged; main's `sanitizeLikeValue`, landed 2026-06-24 via `9e27f7e`, uses
> bracket-class escaping — `[%]`, `[_]`, `[[]` — and needs no ESCAPE clause).
>
> Finding status at landing: **#16** fixed independently via `fcfb5ae` (2026-06-24, tracked as F3 in
> the 06-23 audit); **#17, #18, #19** fixed in the PR that landed this report (2026-09-01);
> **#20** cleared by the dependency PRs #181/#183/#184 (2026-06-23) and later sweeps.

Follow-up to the 2026-02-24 audit (which has now been updated through 2026-03-06). This audit covers the codebase as it stands on commit `1efee5f` (branch `claude/review-mpnext-upstream-7Asdf`), including all changes since the prior audit and the upstream sync work landed today.

## Executive Summary

The application's security posture remains **LOW-MEDIUM risk**, consistent with the prior audit. All 15 findings from 2026-02-24 remain remediated. This audit identifies **4 new findings** — one Medium, one Low, and two Informational — plus 5 moderate npm-audit vulnerabilities in transitive dependencies.

**Single most actionable item**: Finding #16 — `deleteContactLog` accepts a record ID from the client and deletes the row after only a feature-access check, with no `Made_By` ownership verification. The sibling `updateContactLog` already enforces this check. Any user with `contact-lookup` feature access can permanently delete contact logs created by other staff.

**Aggregate state**:
- 4 new findings (1 Medium, 1 Low, 2 Informational) — all small, well-scoped fixes
- 0 critical or high findings
- All prior findings remain closed
- npm audit: 5 moderate, 0 high/critical (different mix from the prior audit's fixes; tracked separately)
- Recent commit `1efee5f` introduces 2 net security improvements (LIKE wildcard escaping, timezone-safe datetime utility) and 1 real bug fix (DOB date-shift) with no new weaknesses

---

## Findings Summary

### New findings (this audit)

| # | Finding | Severity | Category | Status |
|---|---------|----------|----------|--------|
| 16 | `deleteContactLog` missing `Made_By` ownership check | **Medium** | IDOR / Authorization | ✅ Fixed (`fcfb5ae`, 2026-06-24) |
| 17 | `BETTER_AUTH_SECRET` not validated at boot (undefined → empty signing key) | **Low** | Configuration | ✅ Fixed (2026-09-01, boot-time fail-fast) |
| 18 | `auth.ts` returns unvalidated `profile.sub` instead of `validGuid` | **Informational** | Defensive hardening | ✅ Fixed (2026-09-01) |
| 19 | `checkRateLimit` doesn't validate non-empty `userId` (defense-in-depth) | **Informational** | Defensive hardening | ✅ Fixed (2026-09-01) |
| 20 | npm audit: 5 moderate vulnerabilities (better-auth, next/postcss, geist, brace-expansion) | **Low** | Dependencies | ✅ Cleared (dep PRs #181/#183/#184 + later sweeps) |

### Prior audit findings (2026-02-24, all closed)

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1 | Filter injection via LIKE | High | ✅ Fixed — *[editor's note: the `LIKE_ESCAPE_CLAUSE` variant described here never merged; main strengthened LIKE handling with bracket-class `sanitizeLikeValue()` via `9e27f7e` on 2026-06-24]* |
| 2 | Filter injection via IN clause | High | ✅ Fixed |
| 3 | Open redirect on signin page | High | ✅ Fixed |
| 4 | OIDC GUID interpolated in filter | Medium | ✅ Fixed |
| 5 | Missing security headers | High | ✅ Partial — all except CSP |
| 6 | No rate limiting | High | ✅ Fixed |
| 7 | Sensitive data logged | Medium | ✅ Fixed |
| 8 | Debug HTTP PUT logging | Medium | ✅ Fixed |
| 9 | No file type validation | Medium | ✅ Fixed |
| 10 | IDOR — per-record authorization | Medium | Open (risk reduced by RBAC; see #16 for a specific instance) |
| 11 | npm dependency vulnerabilities | Low | ✅ Resolved (different vulns now open — see #20) |
| 12 | Proxy logs request paths | Low | ✅ Fixed |
| 13 | No RBAC | Medium | ✅ Fixed |
| 14 | Dashboard cache shared across users | Low | ✅ Documented as intentional |
| 15 | `BETTER_AUTH_SECRET` fallback chain | Low | ✅ Fixed (see #17 for related boot-time concern) |

---

## Detailed New Findings

### Finding 16: `deleteContactLog` Missing Ownership Verification

**Severity: Medium**
**Category: Insecure Direct Object Reference / Broken Access Control**
**OWASP: A01:2021 — Broken Access Control**
**Status: Open**

**Affected file**: `src/components/contact-logs/actions.ts:104-119`

```typescript
export async function deleteContactLog(contactLogId: number): Promise<void> {
  try {
    const session = await requireFeatureAccess("contact-lookup");
    enforceRateLimit(session.user.id, "write");

    if (!contactLogId || contactLogId <= 0) {
      throw new Error("Valid Contact Log ID is required");
    }

    const contactLogService = await ContactLogService.getInstance();
    await contactLogService.deleteContactLog(contactLogId);   // ← no ownership check
  } catch (error) {
    console.error("Error deleting contact log:", error);
    throw new Error("Failed to delete contact log");
  }
}
```

**Description**: The sibling `updateContactLog` (lines 57-102) loads the existing log, compares `existingLog.Made_By` to the requesting user's MP `User_ID`, and throws "You can only edit contact logs that you created" if they differ. `deleteContactLog` skips this check entirely — any user with the `contact-lookup` feature granted can call `deleteContactLog(<any id>)` and remove the row.

**Attack vector**: An authenticated user with `contact-lookup` access calls the server action with a guessed/enumerated `contactLogId`. The MP record is deleted permanently regardless of who originally created it.

**Impact**:
- Permanent loss of pastoral interaction history created by other staff
- Audit-trail tampering: a user could delete the record of their own past inappropriate interactions
- Compliance concern if contact logs are subject to records-retention policy
- Risk is bounded by RBAC: only users in groups mapped to `contact-lookup` feature can reach the endpoint at all. But within that authorized population, lateral access to other users' deletions is unrestricted.

**Recommendation**: Mirror `updateContactLog`'s ownership check:

```typescript
const session = await requireFeatureAccess("contact-lookup");
enforceRateLimit(session.user.id, "write");
const userId = getMpUserId(session);
if (!userId) throw new Error("Unable to determine user User_ID for audit logging");

if (!contactLogId || contactLogId <= 0) {
  throw new Error("Valid Contact Log ID is required");
}

const contactLogService = await ContactLogService.getInstance();
const existingLog = await contactLogService.getContactLogById(contactLogId);
if (!existingLog) throw new Error("Contact log not found");
if (existingLog.Made_By !== userId) {
  throw new Error("You can only delete contact logs that you created");
}

await contactLogService.deleteContactLog(contactLogId);
```

Add a test case to `src/components/contact-logs/actions.test.ts` covering the rejection path. ~5 minutes of work.

---

### Finding 17: `BETTER_AUTH_SECRET` Not Validated at Boot

**Severity: Low**
**Category: Security Misconfiguration**
**OWASP: A05:2021 — Security Misconfiguration**
**Status: Open**

**Affected file**: `src/lib/auth.ts:13`

```typescript
export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,    // ← may be undefined; not validated
  ...
});
```

**Description**: If `BETTER_AUTH_SECRET` is missing or empty (e.g., misconfigured deployment, typo in env var, secrets manager not loaded), the auth secret silently becomes `undefined`. *[Editor's note, 2026-09-01: the original claim that better-auth falls back to a publicly-known placeholder is stale for ≥1.6 — in production it throws `BetterAuthError` on a missing/default secret, but only as an un-awaited rejected promise surfacing as a 500 on the first request, and outside production (`NODE_ENV` staging/development containers) it silently accepts its built-in default secret. The residual risk was late failure and non-production default-secret acceptance; the fix converts both into a boot-time throw, skipped only during `next build` via `NEXT_PHASE`.]*

The setup script (`scripts/setup.ts`) validates the variable at install time, but a production deployment that bypasses setup (e.g., Docker container with incomplete env) wouldn't trigger that check.

**Attack vector**: An attacker who knows the default Better Auth secret could forge session cookies for any user. Exploitation requires both the env var to be missing AND the attacker to know/guess the default — but the cost of a one-line `throw` to prevent this is negligible.

**Impact**: Severity capped at Low because it requires misconfiguration to trigger. If misconfigured, the impact is total session compromise.

**Recommendation**: Fail fast at module load:

```typescript
const secret = process.env.BETTER_AUTH_SECRET;
if (!secret) {
  throw new Error("BETTER_AUTH_SECRET environment variable is required");
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  secret,
  ...
});
```

Same pattern for any other secret env var (`OIDC_CLIENT_SECRET`, `MINISTRY_PLATFORM_CLIENT_SECRET`) that doesn't already have a runtime check.

---

### Finding 18: `auth.ts` Returns Unvalidated `profile.sub` Instead of `validGuid`

**Severity: Informational**
**Category: Defensive Hardening**
**Status: Open**

**Affected file**: `src/lib/auth.ts:59, 77, 82`

```typescript
try {
  const validGuid = sanitizeGuid(profile.sub);    // line 59 — validated
  const mp = new MPHelper();
  const records = await mp.getTableRecords<MPUserProfile>({
    table: "dp_Users",
    filter: `User_GUID = '${validGuid}'`,         // uses validated value ✓
    ...
  });
  ...
} catch (error) {
  console.error("Auth: Error fetching MP user profile during login:", error);
}

return {
  id: profile.sub,            // line 77 — back to the original, unvalidated value
  ...
  userGuid: profile.sub,      // line 82 — same
  ...
};
```

**Description**: `sanitizeGuid` is called on `profile.sub` and returns the input unchanged on success (or throws on bad format). So practically, `profile.sub` at line 77/82 has the same value as `validGuid` — except when an exception is caught by the `try/catch`. In the catch branch, `validGuid` was never assigned but `profile.sub` is still used for the user fields, meaning a malformed `profile.sub` could be persisted into the session.

**Attack vector**: Hypothetical — requires a compromised or malicious OIDC provider returning a malformed `sub`. The catch branch swallows the error and continues, putting the malformed value into `session.user.userGuid`. Downstream filter sanitization (`sanitizeGuid` in services) would reject the value at the next use, but in the meantime the bad GUID lives in the session.

**Impact**: Negligible in practice. Defensive hardening only.

**Recommendation**: Hoist the GUID validation out of the try/catch so it runs unconditionally, throw on failure (refusing login is correct behaviour for a malformed `sub`), and use the validated value:

```typescript
const validGuid = sanitizeGuid(profile.sub);   // throws on bad format

let mpUserId: number | undefined;
let mpContactId: number | undefined;
let mpNickname: string | undefined;
try {
  const mp = new MPHelper();
  const records = await mp.getTableRecords<MPUserProfile>({
    table: "dp_Users",
    filter: `User_GUID = '${validGuid}'`,
    ...
  });
  ...
} catch (error) {
  console.error("Auth: Error fetching MP user profile during login:", error);
}

return {
  id: validGuid,
  ...
  userGuid: validGuid,
  ...
};
```

---

### Finding 19: `checkRateLimit` Doesn't Validate Non-Empty `userId`

**Severity: Informational**
**Category: Defensive Hardening**
**Status: Open**

**Affected file**: `src/lib/rate-limit.ts:73-98`

```typescript
export function checkRateLimit(
  userId: string,
  tier: RateLimitTier
): { allowed: true } | { allowed: false; retryAfterMs: number } {
  ensureCleanup();
  const config = RATE_LIMITS[tier];
  const key = `${userId}:${tier}`;    // ← if userId is "" or null-coerced, key = ":general"
  ...
}
```

**Description**: If `userId` is an empty string (or coerces to one), the rate-limit key becomes `:general` for every caller. All such requests would share a single bucket, defeating per-user limits.

This is **practically unreachable today**: `requireSession()` is the only thing that should be calling `enforceRateLimit`, and `requireSession()` throws if there's no session before any rate-limit code runs. Better Auth sets `session.user.id` to the OIDC `profile.sub` (a validated GUID per Finding 18). So the empty-string case requires a Better Auth bug, a CustomSession bug, or someone calling `enforceRateLimit` directly with bad input.

**Impact**: None observed. Defense-in-depth only.

**Recommendation**: Add a guard at the top of `checkRateLimit`:

```typescript
if (!userId || typeof userId !== "string") {
  throw new Error("checkRateLimit: userId is required");
}
```

This makes the contract explicit and crashes loudly if an invariant ever breaks.

---

### Finding 20: npm Audit — 5 Moderate Vulnerabilities

**Severity: Low (in aggregate)**
**Category: Vulnerable & Outdated Components**
**OWASP: A06:2021 — Vulnerable and Outdated Components**
**Status: Open — tracked as a separate audit task in `docs/ideas.md`**

`npm audit` reports 5 moderate, 0 high, 0 critical:

| Package | Severity | Path | Fix available | Notes |
|---------|----------|------|---------------|-------|
| `better-auth` | Moderate | direct dep | 1.4.3 (semver-major bump) | Currently on `^1.3.x`; upgrade is the cleanest path |
| `postcss` | Moderate | `next` → `postcss` | via `next` downgrade or postcss patch | XSS in CSS stringify; affects Tailwind/Next build pipeline |
| `next` | Moderate | direct dep | downgrade to 9.3.3 (unsafe — major regression) | Reported because of transitive postcss; do NOT downgrade |
| `geist` | Moderate | `next` → `geist` | downgrade to 1.0.0 | Lower-risk; isolated to fonts |
| `brace-expansion` | Moderate | dev dep tree | automatic via typescript-eslint bump | ReDoS; build-only, no runtime impact |

**Recommendation**: Run a focused dependency-bump pass (tracked in `docs/ideas.md`):
1. Upgrade `better-auth` to `^1.4.3` (test session/OIDC flow end-to-end).
2. Wait for `postcss` patch from the Next.js side rather than downgrading Next.
3. Update transitive `brace-expansion` via `npm update typescript-eslint`.
4. Confirm zero high/critical remain after.

Do not blindly `npm audit fix --force` — the suggested "fix" for `next` is a downgrade to a 4-year-old version.

---

## Recent Changes Security Review — Commit `1efee5f`

The upstream sync work landed today modified or added 17 files. Per-change security review:

### 1. `sanitizeLikeValue()` and `LIKE_ESCAPE_CLAUSE` — `filter-sanitize.ts`

*[Editor's note, 2026-09-01: this section describes the branch's backslash-escape implementation, which never merged. Main's `sanitizeLikeValue` (landed `9e27f7e`, 2026-06-24) uses bracket-class escaping and exports no `LIKE_ESCAPE_CLAUSE`.]*

- **Verdict**: Net security improvement. Strengthens prior Finding 1's remediation.
- **Escape order**: backslash first, then `%`/`_`, then quote-doubling. Correct order — escapes the escape character before introducing it elsewhere.
- **SQL Server compatibility**: `ESCAPE '\\'` is valid T-SQL. MP's REST API translates `$filter` to T-SQL; the clause survives the round-trip.
- **All 3 call sites verified**: `contactService.contactSearch` (line 49), `journey-tools/actions.getAvailablePrograms` (line 69), `journey-tools/actions.getAvailableGroups` (line 90). Each wraps the LIKE expression(s) and appends `${LIKE_ESCAPE_CLAUSE}` once at the end — correct for SQL Server (the ESCAPE clause applies to all LIKEs in the predicate).
- **Test coverage**: 11 new tests in `filter-sanitize.test.ts`. All passing.

### 2. `mp-datetime.ts` Utility Module — New

- **Verdict**: Pure functions, hard-coded to `America/Chicago`. No security concerns.
- **ReDoS surface**: 4 anchored regexes (`DATE_ONLY`, `SQL_DATETIME`, `LOCAL_DATETIME`, `HAS_ZONE`). All have fixed-length character classes and no nested quantifiers; safe.
- **Error handling**: `toMpSqlDatetime` and `parseMpDatetime` throw on unparseable input rather than silently returning garbage. Callers must catch — verify any new caller is comfortable with that contract.
- **Tests**: 17 cases, verified TZ-independent under UTC, LA, Tokyo.

### 3. `calculateAge` / `formatBirthday` DOB Fix — `contact-lookup-details.tsx`

- **Verdict**: Real bug fixed. Previously, `new Date("1990-05-15")` parsed as UTC midnight, shifting to May 14 in a Central-locale browser — off-by-one ages and wrong birthday displays.
- Migrated to the existing `parseLocalDate` helper (already used for membership/last-activity dates in the same file).
- No security impact directly, but improves data accuracy for any feature that gates on age (e.g., minor-child Group Type filtering).

### 4. Reference docs added — `query-syntax.md`, `datetimehandling.md`

- **Verdict**: Pure documentation, no security impact.
- Both files only describe patterns and helper APIs. Reviewed for accidental secret inclusion — none.

### 5. `contactLogService.ts` — `isoToCentralSql` → `toMpSqlDatetime`

- **Verdict**: Behavioural no-op. The new helper has the same conversion semantics as the inlined function.

---

## OWASP Top 10 Surface — Current State

| | Category | Current state |
|---|----------|---------------|
| **A01** | Broken Access Control | RBAC via `requireFeatureAccess` enforced across all 17 server-action files. Per-record auth open at the framework level; #16 is a specific instance |
| **A02** | Cryptographic Failures | Better Auth handles sessions. `BETTER_AUTH_SECRET` validated by setup script but not at runtime (#17) |
| **A03** | Injection | Filter sanitization 100% coverage (sanitizeIds/FilterValue/Guid/LikeValue). CI security-lint job in place. `$select` and `$orderBy` not constructed from user input |
| **A04** | Insecure Design | Tiered rate limiting in place. CSRF protected by Next.js server actions + Better Auth `nextCookies()` plugin |
| **A05** | Security Misconfiguration | All recommended headers present except CSP. Docker non-root + multi-stage. `.dockerignore` excludes secrets |
| **A06** | Vulnerable Components | 5 moderate npm vulns (#20); none in critical security paths |
| **A07** | Identification & Authentication | OIDC via Better Auth genericOAuth. HTTP-only/Secure/SameSite cookies. RP-initiated logout |
| **A08** | Software & Data Integrity | No `eval`, no dynamic require/import from user input. Lockfile present and committed |
| **A09** | Logging & Monitoring | No PII in production logs. `console.error` carries error message only |
| **A10** | SSRF | Only outbound fetches: MP API (env-configured URL) and GitHub API (hardcoded). No user-supplied URLs |

---

## Positive Findings (Confirmed Still in Place)

All 14 positive findings from the 2026-02-24 audit remain valid, plus 2 added by this commit:

1. No XSS vectors — React default escaping, no `dangerouslySetInnerHTML`
2. HTTP-only session cookies via Better Auth + `nextCookies()`
3. Server-side data handling — no client-side MP API calls with tokens
4. Feature-based RBAC enforced on every server action
5. No `localStorage`/`sessionStorage` for sensitive data (PWA dismiss flag only)
6. RP-initiated OIDC logout with MP `end_session_endpoint`
7. Docker non-root user, multi-stage, npm stripped from runner
8. No hardcoded secrets — `.env.example` carries only placeholders
9. No `eval()` or `Function()` — no dynamic code execution
10. Zod validation on form inputs (contact log, journey/compliance tools, feedback)
11. Server-side file validation — MIME whitelist + 20 MB size limit
12. Filter injection protection — 100% of `filter:` strings sanitized
13. Tiered rate limiting (general / write / upload / search / cacheRefresh)
14. Security headers — X-Frame-Options, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
15. **NEW**: LIKE wildcard sanitization via `sanitizeLikeValue` + `LIKE_ESCAPE_CLAUSE`
16. **NEW**: Server-TZ-independent MP datetime handling via `mp-datetime.ts` (covered by tests under UTC / LA / Tokyo)

---

## Recommendations Priority Matrix

### Immediate (this sprint)
| # | Action | Effort | Severity |
|---|--------|--------|----------|
| 16 | Add `Made_By` ownership check to `deleteContactLog` | ~10 min | Medium |
| 17 | Fail fast on missing `BETTER_AUTH_SECRET` at module load | ~5 min | Low |

### Short-term (next 2 weeks)
| # | Action | Effort | Severity |
|---|--------|--------|----------|
| 18 | Use validated `validGuid` instead of `profile.sub` in session return | ~5 min | Informational |
| 19 | Add `userId` validation guard in `checkRateLimit` | ~5 min | Informational |
| 20 | npm audit pass — bump `better-auth` to `^1.4.3`, address postcss/brace-expansion | ~30 min + regression test | Low |

### Long-term (deferred)
| Action | Effort | Severity |
|--------|--------|----------|
| Content-Security-Policy header (open since 2026-02-24) | Medium — requires Next.js inline-script testing | Low-Medium |
| Per-record authorization (IDOR mitigation beyond #16's spot fix) | High — needs MP per-user token strategy or relationship checks | Medium |
| Structured logging with redaction | Medium | Medium (operational, not exploitable) |

---

## Methodology

Three parallel agents swept the codebase covering, in aggregate:

1. **Auth/session/RBAC/IDOR/rate-limit layer** — `auth.ts`, `auth-helpers.ts`, `authorization.ts`, `proxy.ts`, `rate-limit.ts`, all 10 server-action files, both API routes, MP client-credentials handling.
2. **Injection/PII/uploads/redirects** — Every `filter:` interpolation site (verified 100% sanitized), every `console.{log,info,warn}` call, every file upload entry point, every redirect/router push, secrets sweep against the repo, all external `fetch` calls (SSRF check).
3. **Dependencies/headers/Docker/recent changes** — `npm audit`, `next.config.ts` headers, `Dockerfile`, `.env.example`, line-by-line review of commit `1efee5f`, OWASP top-10 surface, CSRF, client storage, `data/*.json`, `'use cache'` functions.

Findings cross-validated by reading the affected files in full (e.g., the full `contact-logs/actions.ts` and `rate-limit.ts` were re-read to confirm #16 and #19 before writing them up).

### Files Reviewed (delta from 2026-02-24 audit)

New since last audit (commit `1efee5f` and prior summer-blast / multi-file-upload work):

**Auth/RBAC/security infrastructure:**
- `src/lib/rate-limit.ts` (added since prior audit)
- `src/lib/authorization.ts` (added since prior audit)
- `src/lib/providers/ministry-platform/utils/filter-sanitize.ts` (extended today with `sanitizeLikeValue`)
- `src/lib/providers/ministry-platform/utils/mp-datetime.ts` (new today)

**New server-action surfaces:**
- `src/components/summer-blast-volunteers/actions.ts`
- `src/components/admin/actions.ts`
- `src/components/admin/journey-tools/actions.ts`
- `src/components/admin/compliance-tools/actions.ts`
- `src/components/admin/feedback/actions.ts`
- `src/components/journey-processing/actions.ts`
- `src/components/compliance-processing/actions.ts`
- `src/components/manage-members/actions.ts`
- `src/components/shared-actions/processing.ts`
- `src/components/feedback/actions.ts`
- `src/app/api/cache-warm/route.ts`

**Configuration:**
- `next.config.ts` (re-verified headers + cacheComponents)
- `Dockerfile` + `.dockerignore`
- `.env.example`
- `data/feature-access.json`, `data/journey-tools.json`, `data/compliance-tools.json`, `data/summer-blast-config.json`

---

*Audit conducted: 2026-05-21*
*Auditor: Claude Code (automated multi-agent security review)*
*Scope: Full application codebase including commit `1efee5f`*
*Prior audit reference: `.claude/notes/security-audit-2026-02-24.md`*
