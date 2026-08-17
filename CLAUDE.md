# CLAUDE.md - MPNext Development Guide

This guide provides essential information for AI assistants (like Claude) working on the MPNext project. Detailed rules are in `.claude/rules/` — this file is the quick-reference overview.

## Rules (detailed docs)

| Rule file | What it covers |
|-----------|---------------|
| [`.claude/rules/git-workflow.md`](.claude/rules/git-workflow.md) | PR creation (`--repo` flag!), branching, merge strategy, pre-PR security review, pre-PR documentation update, upstream sync, `.env.example` sync |
| [`.claude/rules/security.md`](.claude/rules/security.md) | Filter injection (`sanitizeIds`/`sanitizeFilterValue`/`sanitizeGuid`), file uploads, redirects, PII logging, auth, rate limiting, CI security lint |
| [`.claude/rules/caching.md`](.claude/rules/caching.md) | Custom cache handler, service-layer cache, `'use cache'` directive, cache warming, Suspense/PPR patterns |
| [`.claude/rules/context-management.md`](.claude/rules/context-management.md) | Session summaries, status.md, pre-commit checklist, ideas.md sync |
| [`.claude/rules/ui-standards.md`](.claude/rules/ui-standards.md) | Chart formatting, mobile/responsive, contact action links, admin tool editor patterns |
| [`.claude/rules/testing.md`](.claude/rules/testing.md) | When to write tests, test file conventions, mocking patterns, coverage expectations |

**Read the relevant rule file before working in that area.** The pre-commit checklist is in `context-management.md` — run it before every commit.

## Architecture

- **Auth**: Better Auth (`better-auth@^1.6`) with Ministry Platform OAuth via `genericOAuth` plugin (`src/lib/auth.ts`)
  - **User Fields**: `additionalFields` on user model (exported as `userAdditionalFields`): `userGuid`, `mpUserId`, `mpContactId` — populated server-side at login via `getUserInfo`/`mapProfileToUser`
    - **MANDATORY `input: true`**: All three fields MUST keep `input: true`. As of better-auth 1.6, `parseAdditionalUserInputFromProviderProfile` strips any additional field declared `input: false` before the user record is created — silently dropping our server-populated fields (breaks avatar/user menu, `getUserGuid()`, and `$userId` audit attribution). Guarded by `src/lib/auth.test.ts`. Do NOT flip these back to `input: false`.
  - **Session recovery**: If a session somehow lacks `userGuid`, `AuthWrapper` redirects to `/session-error` (a minimal recovery page with a sign-out button that lives outside the `(web)` route group so it can't redirect-loop) instead of rendering a dead app with no sign-out control.
  - **OIDC Logout**: Implements RP-initiated logout flow to properly end Ministry Platform OAuth sessions
  - **Required Environment Variables**: `MINISTRY_PLATFORM_BASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`
  - **MP OAuth Setup**: Requires Post-Logout Redirect URIs configured in Ministry Platform OAuth client (see README.md)
- **Validation**: Zod v4 (`zod@^4.3`) — note: different API from Zod v3 (e.g., `z.guid()` instead of `z.string().uuid()`, type imports via `z.ZodObject<z.ZodRawShape>`)

## Next.js 16 Notes

- **Proxy (formerly Middleware)**: Route protection lives in `src/proxy.ts` with an exported `proxy()` function (not `middleware.ts`/`middleware()`)
- **Async Dynamic APIs**: `params`, `searchParams`, `cookies()`, `headers()` must always be awaited — synchronous access is removed

## Code Style

- **Imports**: Use `@/` alias for all internal imports
- **Components**: React Server Components by default, "use client" only when needed for interactivity
- **Types**: TypeScript interfaces exported from models, Zod schemas for validation
- **Naming**:
  - PascalCase for components/types
  - camelCase for functions/variables
  - kebab-case for all component files and folders
  - snake_case for Ministry Platform API fields
- **Exports**: Use named exports for all components (no default exports)
- **UI Components**: Keep in `src/components/ui/` following shadcn conventions
- **Feature Components**: Organize in kebab-case folders with index.ts barrel exports
- **Actions**:
  - Feature-specific actions: co-locate in component folder as `actions.ts`
  - Shared actions: place in `src/components/shared-actions/`
- **Ministry Platform Structure**:
  - Database models (generated): `src/lib/providers/ministry-platform/models/` - auto-generated from DBMS
  - Zod schemas (generated): `src/lib/providers/ministry-platform/models/*Schema.ts` - for optional runtime validation
  - DTOs/ViewModels (hand-written): `src/lib/dto/` - application-level data transfer objects
  - Services (hand-written): `src/services/` - singleton classes wrapping MPHelper for domain operations
- **Validation**:
  - Use optional `schema` parameter in `createTableRecords()` and `updateTableRecords()` for runtime validation before API calls
  - For updates, set `partial: false` to require all fields (default is `partial: true` for partial updates)
  - Validation errors provide detailed feedback with record index and field-level issues

## Data Flow

Server actions in `actions.ts` should call **service classes** (not MPHelper directly).

**When writing MP queries**: Any code that builds `filter:` parameters MUST use sanitization functions. See [`.claude/rules/security.md`](.claude/rules/security.md) for the required patterns — CI will fail if `.join()` appears in filter contexts without `sanitizeIds()`.

### Ministry Platform API Concurrency

The MP API (`moody.ministryplatform.com`) has limited connection capacity. **Never fire unbounded parallel requests** — use the `mapWithConcurrency` utility in `dashboardService.ts` to limit concurrent API calls (currently capped at 6). This is especially important for methods that iterate over many months or records.

Without concurrency control, bursts of 50+ simultaneous connections cause `ConnectTimeoutError` (TCP timeout), which can cascade into token refresh failures and silent data loss. This was the root cause of intermittent 0-attendance on the dashboard (fixed 2026-03-15).

### Ministry Platform REST API Notes

- **POST-based reads for long queries**: MP supports `POST tables/{table}/get` with a JSON body (`{ "Select": "...", "Filter": "...", "OrderBy": "...", "Top": N, ... }`). This avoids URL length limits when filters or select clauses are very long. We don't currently use this — our `$filter` strings fit in query parameters — but it's available if needed.
- **Audit log joins**: You can join audit creation/update data in any `$Select` via `dp_Created.*` (who created, when) and `dp_Updated.*` (who last updated, when). Useful for "created by" or "last modified" info without a separate query.

## Feature Visibility & Access Control

Feature visibility in the home page and sidebar is controlled by RBAC (feature-to-User-Group mappings), not environment variables. Users only see features their User Groups grant access to. Admin users (in `ADMIN_USER_GROUP_IDS` groups) see all features plus the admin settings page.

## Key Development Practices

1. **Never manually edit generated files** - regenerate types using `npm run mp:generate:models`
2. **Report file changes** - after completing work, always report in chat which files were **created**, **modified**, or **removed**

## Timezone Handling — Ministry Platform Dates

MP returns dates without timezone info in **US Central Time**. `new Date("2026-03-12")` parses as UTC, showing the wrong day in Central.

**Rule**: Parse MP dates as local time using `parseLocalDate()` (in `src/components/contact-lookup-details/contact-lookup-details.tsx`) — extracts year/month/day components to avoid UTC shift. When sending dates to MP, use SQL format (`YYYY-MM-DD HH:MM:SS`) — convert **after** Zod validation, not before.

**Sending dates to MP**: Pass ISO datetime through Zod validation, then convert to Central Time SQL format in the **service layer** using `Intl.DateTimeFormat` with `timeZone: "America/Chicago"`. Do NOT use `getHours()`/`getMinutes()` — those use server-local time, which is UTC in Docker. Reference implementation: `isoToCentralSql()` in `contactLogService.ts`. For date-only values (no meaningful time), use noon UTC (`T12:00:00.000Z`) so the date stays correct after Central conversion regardless of DST.

## Reference Documents

- **[Project Status](docs/status.md)** - Quick-reference snapshot of current state (read first at session start)
- **[Components Reference](.claude/references/components.md)** - Detailed inventory of all components, their purposes, server actions, and compliance status
- **[Ministry Platform Schema](.claude/references/ministryplatform.schema.md)** - Auto-generated summary of Ministry Platform database tables, primary keys, and foreign key relationships
- **[Security Audit](.claude/notes/security-audit-2026-02-24.md)** - Full security audit report with 15 findings
