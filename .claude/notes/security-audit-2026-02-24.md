# Security Audit Report — 2026-02-24 (Updated 2026-03-06)

## Executive Summary

This is a comprehensive security audit of the MPNext (mp-charts) application, a Next.js 16 application that integrates with Ministry Platform via REST API. The application handles **personally identifiable information (PII)** including names, email addresses, phone numbers, dates of birth, and background check data for church contacts, volunteers, baptism applicants, and membership applicants.

**Overall Risk Assessment: LOW-MEDIUM** (improved from MEDIUM-HIGH at time of audit)

The application has solid fundamentals — proper session management, server-side data handling, no XSS vectors. All critical and high findings from the original audit have been remediated. Remaining open items are IDOR (medium) and CSP header (low — all other security headers are in place). RBAC has been fully implemented via feature-based access control.

---

## Findings Summary

| # | Finding | Severity | Category | Status |
|---|---------|----------|----------|--------|
| 1 | Filter injection via string interpolation (LIKE) | **HIGH** | Injection | ✅ Fixed |
| 2 | Filter injection via IN clause array joins | **HIGH** | Injection | ✅ Fixed |
| 3 | Open redirect on signin page | **HIGH** | Redirect | ✅ Fixed |
| 4 | OIDC GUID interpolated in filter | **MEDIUM** | Injection | ✅ Fixed |
| 5 | Missing security headers (CSP, X-Frame-Options) | **HIGH** | Configuration | ✅ Partial (no CSP — see notes) |
| 6 | No rate limiting on server actions/API routes | **HIGH** | DoS/Abuse | ✅ Fixed |
| 7 | Sensitive data logged to console | **MEDIUM** | Data Exposure | ✅ Fixed |
| 8 | Debug HTTP PUT logging in production | **MEDIUM** | Data Exposure | ✅ Fixed |
| 9 | No file type validation on uploads | **MEDIUM** | Input Validation | ✅ Fixed |
| 10 | IDOR risk — no per-record authorization | **MEDIUM** | Authorization | Open (risk reduced by RBAC) |
| 11 | npm dependency vulnerabilities (eslint chain) | **LOW** | Dependencies | ✅ Resolved (2026-02-26) |
| 12 | Proxy logs request paths | **LOW** | Information Disclosure | ✅ Fixed |
| 13 | No RBAC — all authenticated users see all data | **MEDIUM** | Authorization | ✅ Fixed (2026-03-04) |
| 14 | Dashboard cache shared across all users | **LOW** | Data Exposure | ✅ Documented as intentional |
| 15 | `BETTER_AUTH_SECRET` fallback to `NEXTAUTH_SECRET` | **LOW** | Configuration | ✅ Fixed |

---

## Detailed Findings

### Finding 1: Filter Injection via String Interpolation (LIKE)

**Severity: HIGH**
**Category: Injection**
**OWASP: A03:2021 — Injection**

**Description:**
The `ContactService.contactSearch()` method constructs a filter string using direct string interpolation of user-provided search input. An attacker can craft a search term that breaks out of the LIKE clause and injects arbitrary filter conditions.

**Affected File:** `src/services/contactService.ts:47`
```typescript
filter: `First_Name LIKE '%${search}%' OR Last_Name LIKE '%${search}%' ...`
```

**Attack Vector:**
A user could submit a search term like `' OR 1=1 --` which would modify the filter to return all records, or `' OR Contact_Status_ID=1 AND '1'='1` to add unauthorized filter conditions.

**Impact:**
- Unauthorized data access (all contact records)
- Data exfiltration of PII (names, emails, phones, dates of birth)
- The Ministry Platform REST API filter is passed to a backend SQL query; while the API likely has its own protections, filter manipulation could bypass intended restrictions

**Recommendation:**
Sanitize the search input by escaping single quotes and special characters before interpolation:
```typescript
function sanitizeFilterValue(value: string): string {
  return value.replace(/'/g, "''").replace(/[%_\[\]]/g, '[$&]');
}
```

---

### Finding 2: Filter Injection via IN Clause Array Joins

**Severity: HIGH**
**Category: Injection**
**OWASP: A03:2021 — Injection**

**Description:**
Across multiple services, arrays of IDs are joined into filter strings using `.join(',')` without validating that array elements are actually numbers. While most IDs originate from trusted sources (database results, environment variables), the pattern is unsafe by default.

**Affected Files (representative, not exhaustive):**
- `src/services/dashboardService.ts:39` — `Group_Type_ID IN (${ids})`
- `src/services/dashboardService.ts:107-108` — `${idColumn} IN (${batchIds.join(',')})`
- `src/services/dashboardService.ts:521` — `Group_Participants.Group_ID IN (...)`
- `src/services/dashboardService.ts:626` — `Event_Participants.Group_ID IN (...)`
- `src/services/dashboardService.ts:806` — `Event_Metrics.Event_ID IN (...)`
- `src/services/volunteerService.ts:181, 215, 228, 655, 669, 678, 735`
- `src/services/baptismService.ts:414, 469, 491, 579`
- `src/services/membershipService.ts:111, 325, 348, 431`
- `src/services/contactLogService.ts:66`

**Impact:**
Lower risk than Finding 1 because the IDs mostly come from database query results (numbers), but the pattern is fragile. If any ID source is ever changed to accept user input, the vulnerability becomes exploitable.

**Recommendation:**
Create a utility function to validate and sanitize ID arrays:
```typescript
function sanitizeIds(ids: number[]): string {
  return ids.filter(id => Number.isFinite(id) && id > 0).join(',');
}
```

---

### Finding 3: Open Redirect on Signin Page

**Severity: HIGH**
**Category: Redirect**
**OWASP: A01:2021 — Broken Access Control**

**Affected File:** `src/app/signin/page.tsx:9, 18, 24`
```typescript
const callbackUrl = searchParams?.get("callbackUrl") || "/";
// ...
window.location.href = callbackUrl;  // Line 18 — no validation
authClient.signIn.oauth2({
  providerId: "ministryplatform",
  callbackURL: callbackUrl,          // Line 24 — passed to OAuth flow
});
```

**Description:**
The `callbackUrl` query parameter is read from the URL search params and used directly for both:
1. Client-side redirect when the user is already signed in (line 18)
2. The OAuth callback URL when initiating sign-in (line 24)

An attacker can craft a phishing URL like:
```
https://your-app.com/signin?callbackUrl=https://evil-site.com/steal-session
```

After authentication, the user is redirected to the attacker's site. Since the redirect happens after legitimate authentication on the real app, users are less likely to notice they've been redirected to a malicious site.

**Impact:**
- Phishing attacks using the app's legitimate domain as a redirect intermediary
- Session token theft if the OAuth callback URL can be manipulated
- Users trust the redirect because it follows a legitimate login

**Recommendation:**
Validate that `callbackUrl` is a relative path:
```typescript
function getSafeCallbackUrl(url: string | null): string {
  if (!url) return "/";
  // Only allow relative URLs that start with / and don't contain //
  if (url.startsWith("/") && !url.startsWith("//") && !url.includes("://")) {
    return url;
  }
  return "/";
}
const callbackUrl = getSafeCallbackUrl(searchParams?.get("callbackUrl"));
```

---

### Finding 4: OIDC GUID Interpolated in Filter

**Severity: MEDIUM**
**Category: Injection**
**OWASP: A03:2021 — Injection**

**Affected File:** `src/lib/auth.ts:60`
```typescript
filter: `User_GUID = '${profile.sub}'`
```

**Description:**
The `profile.sub` value from the OIDC provider is interpolated into a filter string. While this value comes from a trusted OIDC provider (Ministry Platform), it is not validated as a proper GUID format before interpolation. A compromised or malicious OIDC provider could inject filter conditions.

**Recommendation:**
Validate the GUID format before use:
```typescript
const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!guidRegex.test(profile.sub)) {
  throw new Error('Invalid GUID format from OIDC provider');
}
```

---

### Finding 5: Missing Security Headers

**Severity: HIGH**
**Category: Configuration**
**OWASP: A05:2021 — Security Misconfiguration**
**Status: ✅ Partial — all headers implemented except CSP**

**Affected File:** `next.config.ts`

**Current state (as of 2026-03-06):**
The following headers are configured in `next.config.ts`:
- ✅ **X-Frame-Options**: `DENY` — prevents clickjacking
- ✅ **X-Content-Type-Options**: `nosniff` — prevents MIME-type sniffing
- ✅ **Referrer-Policy**: `strict-origin-when-cross-origin`
- ✅ **X-DNS-Prefetch-Control**: `on`
- ✅ **Strict-Transport-Security**: `max-age=31536000; includeSubDomains`
- ✅ **Permissions-Policy**: `camera=(), microphone=(), geolocation=()`
- ❌ **Content-Security-Policy (CSP)**: Not yet implemented

**Remaining work — CSP:**
Adding CSP requires careful testing because Next.js injects inline scripts for hydration, and Recharts (SVG-based) may need `unsafe-inline` for styles. A CSP with `unsafe-inline` for scripts/styles provides limited XSS protection but still enables `frame-ancestors 'none'` (redundant with X-Frame-Options) and restricts `connect-src`, `img-src`, etc. Consider implementing CSP with nonce-based script policy when Next.js 16 nonce support stabilizes.

---

### Finding 6: No Rate Limiting

**Severity: HIGH**
**Category: DoS/Abuse**
**OWASP: A04:2021 — Insecure Design**

**Description:**
No rate limiting is implemented on any server action or API route. All operations can be called unlimited times per session.

**Affected Areas:**
- All server actions in `src/components/*/actions.ts`
- Auth API route at `src/app/api/auth/[...all]/route.ts`
- Contact search (allows unlimited PII lookups)
- Dashboard data (allows unlimited heavy database queries)
- Write operations (create/update milestones, form responses)

**Impact:**
- Denial of service via repeated expensive dashboard queries
- Data scraping via rapid contact search calls
- Ministry Platform API quota exhaustion
- Brute force attacks against authentication

**Recommendation:**
Implement rate limiting using a middleware-based approach or in-memory token bucket. For Next.js server actions, a per-user rate limiter based on the session cookie is most appropriate. Consider a package like `rate-limiter-flexible` or implement a simple in-memory rate limiter for the single-instance deployment.

---

### Finding 7: Sensitive Data Logged to Console

**Severity: MEDIUM**
**Category: Data Exposure**
**OWASP: A09:2021 — Security Logging and Monitoring Failures**

**Description:**
Multiple services log sensitive data including PII using `console.log` and `JSON.stringify`. In production, these logs may be captured by log aggregation services, making them accessible to anyone with log access.

**Affected Files:**
| File | Line | Data Logged |
|------|------|-------------|
| `src/services/contactService.ts` | 85 | Contact update records (email, phone) |
| `src/services/contactLogService.ts` | 124, 138, 143 | Contact log creation data (notes, dates) |
| `src/services/contactLogService.ts` | 168-169 | Contact log update data |
| `src/services/contactLogService.ts` | 209, 216 | Contact log deletion IDs |
| `src/services/toolService.ts` | 44, 53, 59, 79, 87, 91 | Page data and user tool paths |
| `src/services/dashboardService.ts` | 608, 615, 629, 649, 668, 746 | Count data (low risk but noisy) |

**Impact:**
- PII exposure in server logs (names, emails, phones, notes)
- Contact interaction notes exposed to anyone with log access
- Increased attack surface if logs are compromised

**Recommendation:**
- Remove `console.log` statements that contain PII (`JSON.stringify(record)`, `JSON.stringify(contactLogData)`)
- Keep `console.error` for error tracking but redact PII
- Consider a structured logging library that supports log levels and redaction

---

### Finding 8: Debug HTTP PUT Logging in Production

**Severity: MEDIUM**
**Category: Data Exposure**
**OWASP: A09:2021 — Security Logging and Monitoring Failures**

**Affected File:** `src/lib/providers/ministry-platform/utils/http-client.ts:80-85`
```typescript
console.log("HTTP PUT Request:", {
    url, endpoint,
    body: JSON.stringify(body, null, 2),
    queryParams
});
```

**Description:**
Every PUT request body is logged in full, including any PII being written to Ministry Platform. The error handler at line 99-103 also logs the response body which may contain sensitive data from the API.

**Impact:**
- Every data modification is logged with full payload
- Contact updates (emails, phones), milestone notes, etc. all appear in logs

**Recommendation:**
Remove or gate behind a debug environment variable:
```typescript
if (process.env.NODE_ENV === 'development') {
  console.log("HTTP PUT Request:", { url, endpoint });
}
```

---

### Finding 9: No File Type Validation on Uploads

**Severity: MEDIUM**
**Category: Input Validation**
**OWASP: A04:2021 — Insecure Design**

**Description:**
File uploads validate size (1MB limit for photos) but do not validate file type or MIME type. The baptism, membership, and volunteer processing features all accept file uploads for milestone documents and contact photos.

**Affected Files:**
- `src/components/volunteer-processing/actions.ts:77-104` (createFormResponse)
- `src/components/volunteer-processing/actions.ts:106-134` (uploadVolunteerPhoto)
- `src/components/baptism-processing/actions.ts:44-72` (createBaptismMilestone)
- `src/components/baptism-processing/actions.ts:121-149` (uploadApplicantPhoto)
- `src/components/membership-processing/actions.ts:33-61` (createMembershipMilestone)
- `src/components/membership-processing/actions.ts:134-162` (uploadApplicantPhoto)

**Impact:**
- Malicious file types could be uploaded (executables, scripts)
- Files are stored in Ministry Platform and served via file URLs, potentially enabling stored XSS if the Ministry Platform file server doesn't set proper Content-Type headers

**Recommendation:**
Add MIME type validation in server actions:
```typescript
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_DOCUMENT_TYPES = [...ALLOWED_IMAGE_TYPES, 'application/pdf'];

if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
  return { success: false, error: "Invalid file type. Allowed: JPEG, PNG, GIF, WebP" };
}
```

---

### Finding 10: Insecure Direct Object References (IDOR)

**Severity: MEDIUM**
**Category: Authorization**
**OWASP: A01:2021 — Broken Access Control**

**Description:**
All server actions that fetch record details accept numeric IDs directly from the client (contactId, participantId, groupParticipantId, milestoneRecordId, etc.) and only check that the user is authenticated — not that the user has permission to access that specific record.

**Affected Files:**
- `src/components/volunteer-processing/actions.ts:29-42` — `getVolunteerDetail(contactId, participantId, groupParticipantId)`
- `src/components/volunteer-processing/actions.ts:44-53` — `getMilestoneFiles(milestoneRecordId)`
- `src/components/baptism-processing/actions.ts:29-42` — `getApplicantDetail(contactId, participantId, groupParticipantId)`
- `src/components/membership-processing/actions.ts:18-30` — `getApplicantDetail(contactId, participantId, groupParticipantId)`
- `src/components/contact-lookup-details/actions.ts:8-28` — `getContactDetails(guid)`
- `src/components/contact-lookup-details/actions.ts:30-64` — `getContactLogsByContactId(contactId)`
- `src/components/contact-logs/actions.ts:86-100` — `deleteContactLog(contactLogId)`

**Impact:**
An authenticated user with feature access could access any record within that feature by guessing or enumerating record IDs. This is mitigated by:
1. **RBAC (Finding 13)**: Users must be in an allowed User Group to access each feature — unauthenticated or unauthorized users are blocked before any record lookup
2. **Ministry Platform backend permissions**: Client credentials may restrict data access at the API level

However, within a feature a user has access to, there is no per-record authorization check (e.g., a user with "contact-lookup" access can look up any contact).

**Recommendation:**
- For the highest-risk areas (background checks, contact details), verify the requesting user's relationship to the record
- Consider using access-token-based `MPHelper` instances (already supported) so the MP API enforces per-user security
- At minimum, log access attempts with the requesting user's ID for audit trail
- **Risk reduced significantly by RBAC** — only users in explicitly configured User Groups can reach record-level endpoints

---

### Finding 11: npm Dependency Vulnerabilities

**Severity: LOW**
**Category: Dependencies**
**OWASP: A06:2021 — Vulnerable and Outdated Components**
**Status: ✅ Resolved (2026-02-26)**

**Description:**
At the time of the audit, `npm audit` reported 15 vulnerabilities (1 moderate, 14 high), all in the eslint dependency chain:
- `minimatch` < 10.2.1: ReDoS via repeated wildcards (HIGH)
- `ajv` < 6.14.0: ReDoS when using `$data` option (MODERATE)

**Resolution:**
On 2026-02-26, `npm audit fix` resolved 3 CVEs (lockfile-only changes):
- rollup CVE-2026-27606 (High)
- minimatch GHSA-3ppc-4f35-3m26 (High)
- ajv GHSA-2g4f-4pwh-qvx6 (Moderate)

These were dev dependencies only — eslint and its plugins are not included in the production Docker image. The Dockerfile correctly strips npm from the runner image.

---

### Finding 12: Proxy Logs Request Paths

**Severity: LOW**
**Category: Information Disclosure**

**Affected File:** `src/proxy.ts:9, 17, 21, 25`

**Description:**
The proxy logs every request path and session state transitions. While individual paths are not sensitive, the aggregate log shows user navigation patterns.

**Recommendation:**
Remove or reduce logging verbosity in production:
```typescript
if (process.env.NODE_ENV === 'development') {
  console.log(`Proxy: Allowing request to ${pathname}`);
}
```

---

### Finding 13: No Role-Based Access Control (RBAC)

**Severity: MEDIUM**
**Category: Authorization**
**OWASP: A01:2021 — Broken Access Control**
**Status: ✅ Fixed (2026-03-04)**

**Description (at time of audit):**
All authenticated users had identical access to all features and data. No role-based access control existed.

**Resolution:**
Full feature-based RBAC was implemented in `src/lib/authorization.ts`:

- **`requireFeatureAccess(feature)`** — server-side enforcement on every server action. Calls `requireSession()` internally (handling auth + general rate limiting), then checks the user's Ministry Platform User Groups against the feature's allowed groups.
- **Feature types**: Static features (`dashboard`, `contact-lookup`, `contact-logs`, `admin`) and dynamic features (`journey:{slug}`, `compliance:{slug}`) generated from enabled tool configs.
- **Super-admin groups**: `ADMIN_USER_GROUP_IDS` env var defines groups with full access. The `admin` feature is super-admin only.
- **Admin UI**: Feature access configuration is managed via `/admin` with a persistent `data/feature-access.json` config file.
- **Client-side gating**: `getAccessibleFeatures()` returns the list of features a user can access, used by sidebar/navigation to hide inaccessible features.
- **Coverage**: All 17 server action files use `requireFeatureAccess()` instead of bare `requireSession()`.

**Key files:**
- `src/lib/authorization.ts` — RBAC logic, feature config, `requireFeatureAccess()`
- `src/components/admin/actions.ts` — admin feature access management
- `src/lib/authorization.test.ts` — test coverage

---

### Finding 14: Dashboard Cache Shared Across All Users

**Severity: LOW**
**Category: Data Exposure**

**Affected File:** `src/components/dashboard/actions.ts`

**Description:**
Dashboard data is cached with shared tags (`dashboard-data`, `year-N`) and served to all authenticated users. This is likely by design (dashboard shows aggregate metrics, not per-user data) but means all users see the same data regardless of their Ministry Platform permissions.

**Recommendation:**
Document this as intentional. If user-specific dashboard access is ever needed, the cache would need to be keyed by user or permission level.

---

### Finding 15: `BETTER_AUTH_SECRET` Fallback Chain

**Severity: LOW**
**Category: Configuration**

**Affected File:** `src/lib/auth.ts:13`
**Status: ✅ Fixed**

**Description (at time of audit):**
`BETTER_AUTH_SECRET` fell back to `NEXTAUTH_SECRET` if not set, causing confusion about which secret signs sessions.

**Resolution:**
The fallback has been removed. `src/lib/auth.ts` now uses `process.env.BETTER_AUTH_SECRET` directly with no fallback chain. The setup check script validates that the variable is set.

---

## Positive Security Findings

The audit identified several strong security practices (updated 2026-03-06 with post-audit improvements):

1. **No XSS vectors**: React's default escaping is used throughout; no `dangerouslySetInnerHTML` or `innerHTML` usage found
2. **HTTP-only session cookies**: Better Auth with `nextCookies()` plugin properly uses HTTP-only cookies
3. **Server-side data handling**: All data fetching happens via server actions; no client-side API calls with tokens
4. **Feature-based RBAC**: Every server action calls `requireFeatureAccess()` which enforces authentication, rate limiting, and User Group-based authorization
5. **No localStorage/sessionStorage for sensitive data**: Session managed exclusively via cookies
6. **Proper OIDC logout**: Implements RP-initiated logout with Ministry Platform OAuth endsession
7. **Docker security**: Non-root user, multi-stage build, npm stripped from runner image
8. **No hardcoded secrets**: All secrets via environment variables
9. **No eval() or Function()**: No dynamic code execution
10. **Zod validation on forms**: Contact log creation/update uses Zod schema validation
11. **Server-side file size + MIME validation**: Uploads validate both size and file type on the server
12. **Filter injection protection**: All filter parameters use `sanitizeFilterValue()`, `sanitizeIds()`, or `sanitizeGuid()` from `filter-sanitize.ts`
13. **Tiered rate limiting**: Server actions are rate-limited per user with configurable tiers (general, write, upload, search, cacheRefresh)
14. **Security headers**: X-Frame-Options, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy all configured

---

## Recommendations Priority Matrix

### Completed (all original immediate/short-term/medium-term items)

| # | Action | Status |
|---|--------|--------|
| 1 | Fix open redirect on signin page | ✅ Fixed |
| 2 | Add security headers to `next.config.ts` | ✅ Fixed (except CSP) |
| 3 | Sanitize contact search input in `contactService.ts` | ✅ Fixed |
| 4 | Remove PII from console.log statements | ✅ Fixed |
| 5 | Remove debug HTTP PUT logging in `http-client.ts` | ✅ Fixed |
| 6 | Add input sanitization utility for all filter values | ✅ Fixed (`filter-sanitize.ts`) |
| 7 | Validate GUID format in `auth.ts` | ✅ Fixed (`sanitizeGuid()`) |
| 8 | Add MIME type validation to file uploads | ✅ Fixed (`ALLOWED_IMAGE_TYPES` / `ALLOWED_DOCUMENT_TYPES`) |
| 9 | Gate proxy logging behind NODE_ENV | ✅ Fixed |
| 10 | Implement rate limiting on server actions | ✅ Fixed (`rate-limit.ts`, tiered) |
| 11 | Implement RBAC | ✅ Fixed (`authorization.ts`, feature-based) |
| 12 | Resolve dependency audit vulnerabilities | ✅ Fixed (`npm audit fix` 2026-02-26) |

### Remaining Open Items

| # | Action | Effort | Impact | Notes |
|---|--------|--------|--------|-------|
| A | Add Content-Security-Policy (CSP) header | Medium | Low-Medium | Requires testing with Next.js inline scripts + Recharts SVG; consider nonce-based approach |
| B | IDOR mitigation for high-risk endpoints | High | Medium | Risk reduced by RBAC — only authorized users reach record endpoints. Per-record auth would require relationship checks or per-user MP API tokens |
| C | Add structured logging with redaction | Medium | Medium | Current state is safe (no PII logged), but structured logging would improve observability |

---

## Additional Security Scans Recommended

### 1. OWASP ZAP Dynamic Scan
Run an automated dynamic security scan against the running application:
```bash
docker run -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t https://your-app-url
```
This will detect missing headers, cookie security issues, and other runtime vulnerabilities.

### 2. Ministry Platform API Security Review
The filter injection findings depend on how Ministry Platform's REST API handles filter values. Test whether the API:
- Escapes or parameterizes filter values
- Has its own injection protections
- Limits the data accessible via filters

### 3. Docker Image Vulnerability Scan
```bash
docker scout cves your-image:latest
# or
trivy image your-image:latest
```
Check for OS-level and Node.js runtime vulnerabilities in the production image.

### 4. Secret Scanning
Run a secret scanner against the repository to ensure no credentials have been committed:
```bash
gitleaks detect --source . --verbose
```

### 5. Dependency License Audit
```bash
npx license-checker --summary
```
Ensure no dependencies with incompatible licenses are included.

---

## Methodology

This audit was conducted through manual code review covering:

1. **Authentication & Session Management**: Better Auth configuration, OAuth flow, session handling, proxy/middleware
2. **Server Actions & API Routes**: All `"use server"` files, input validation, authorization checks
3. **Services Layer**: All service classes, filter construction patterns, data handling
4. **HTTP Client**: Request/response handling, token management, error handling
5. **PII Data Flow**: Server → client data paths, display components, logging
6. **Client-Side Security**: XSS vectors, storage usage, URL construction, input validation
7. **Configuration**: Next.js config, Docker setup, environment variables
8. **Dependencies**: npm audit, Dockerfile analysis
9. **Infrastructure**: CORS, security headers, rate limiting

### Files Reviewed (complete list)

**Authentication:**
- `src/lib/auth.ts`
- `src/lib/auth-helpers.ts`
- `src/lib/auth-client.ts`
- `src/proxy.ts`
- `src/app/api/auth/[...all]/route.ts`
- `src/app/signin/page.tsx`

**Services:**
- `src/services/contactService.ts`
- `src/services/contactLogService.ts`
- `src/services/dashboardService.ts`
- `src/services/volunteerService.ts`
- `src/services/baptismService.ts`
- `src/services/membershipService.ts`
- `src/services/toolService.ts`
- `src/services/userService.ts`

**Server Actions:**
- `src/components/contact-lookup/actions.ts`
- `src/components/contact-lookup-details/actions.ts`
- `src/components/dashboard/actions.ts`
- `src/components/volunteer-processing/actions.ts`
- `src/components/baptism-processing/actions.ts`
- `src/components/membership-processing/actions.ts`
- `src/components/contact-logs/actions.ts`
- `src/components/user-menu/actions.ts`
- `src/components/shared-actions/user.ts`

**Ministry Platform Provider:**
- `src/lib/providers/ministry-platform/helper.ts`
- `src/lib/providers/ministry-platform/client.ts`
- `src/lib/providers/ministry-platform/utils/http-client.ts`
- `src/lib/providers/ministry-platform/auth/client-credentials.ts`

**Configuration:**
- `next.config.ts`
- `Dockerfile`
- `.env.example`

---

*Audit conducted: 2026-02-24*
*Last updated: 2026-03-06 — status refresh for all 15 findings*
*Auditor: Claude Code (automated security review)*
*Scope: Full application codebase, excluding generated types and third-party packages*
