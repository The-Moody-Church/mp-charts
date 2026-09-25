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

## Node Runtime

**Node 24 LTS** ("Krypton", security-supported through 2028-04-30). The version is declared in
exactly **two** places, and they must move together:

- **`.nvmrc`** (`24`) — read by CI via `node-version-file` in both workflows
  (`docker-build-push.yml`, `audit-nightly.yml`), and by any local version manager
- **the four `FROM node:24-alpine` lines** — `Dockerfile` (deps/builder/runner) + `Dockerfile.dev`

`engines.node` in `package.json` is a **floor** (`>=24.0.0`), not a pin — local dev may legitimately
run newer. The precise guardrail is `@types/node`, deliberately held to the **same major as the
container** (`^24`): a newer-Node-only API then fails `tsc` instead of surfacing at runtime on TMC1.

Node 24 leaves *active* LTS on 2026-10-20 (Node 26 takes over) but stays security-supported to
2028-04-30. **When bumping the major**, change all of these in one commit: `.nvmrc`, the four `FROM`
tags, `@types/node`, `engines.node`, and `REQUIRED_NODE_VERSION` in `scripts/setup.ts`.

Note the runner stage runs `npm uninstall -g npm`, so **the production image ships no npm** — the
npm version that matters is CI's (whatever Node 24 bundles: 11.19.0), which gates
`npm audit --audit-level=high`.

## Architecture

- **Auth**: Better Auth (`better-auth@~1.7`, range `>=1.7.5 <1.8.0`) with Ministry Platform OAuth via the `genericOAuth` plugin (`src/lib/auth.ts`), which 1.7 registers as a first-class social provider. Sign-in is `authClient.signIn.social({ provider: MP_PROVIDER_ID })`; the callback is `/api/auth/callback/ministryplatform` — **our providerId has no hyphen**, upstream MPNext's `ministry-platform` is not ours. The sign-in OIDC client is **`TM.Widgets`** (`OIDC_CLIENT_ID`); `MPNext` (`MINISTRY_PLATFORM_CLIENT_ID`) is only the server-to-server data client
  - **Load-bearing 1.7 settings — each pinned by `src/lib/auth.test.ts` (and end to end by `src/app/api/auth/[...all]/route.flow.test.ts`), do not "tidy" them away**: `pkce: false` (1.7 **defaults PKCE on**; TM.Widgets rejects it at token exchange, breaking every app); **no `discoveryUrl`** — explicit `authorizationUrl`/`tokenUrl`/`userInfoUrl` instead, because 1.7 fetches discovery once at boot with no timeout or retry, so one MP hiccup at container start would disable sign-in until restart; `getMpUserInfo` returns `sub` **and** `id` plus an explicit `accountSubject` (1.7 derives the account key from the raw profile's `sub`; tsc cannot catch its absence); `disableIdTokenNonceBinding: true` (MP never echoes the nonce — inert without discovery, kept as a guard); `disableProviderLogout: true` (sign-out stays hand-built via `id-token-store.ts`)
  - **`/sign-in/social` carries a direct ID-token sign-in branch in 1.7** that we never use. It is refused three ways: the route body filter (`allowedSignInSocialKeys`, with Content-Type pinned to exactly `application/json` so better-auth cannot parse the body differently), a `hooks.before` guard in `auth.ts`, and an id_token/userinfo `sub` cross-check in `getUserInfo`
  - **User Fields**: `additionalFields` on user model (exported as `userAdditionalFields`): `userGuid` (required), `mpUserId`, `mpContactId`, `mpEmail` — populated server-side at login via `getUserInfo`/`mapProfileToUser`
    - **MANDATORY `input: true`**: All four fields MUST keep `input: true`. Since better-auth 1.6 (unchanged in 1.7), `parseAdditionalUserInputFromProviderProfile` strips any additional field declared `input: false` before the user record is created — silently dropping our server-populated fields (breaks avatar/user menu, `getUserGuid()`, and `$userId` audit attribution). Guarded by `src/lib/auth.test.ts`. Do NOT flip these back to `input: false`.
  - **Session recovery**: If a session somehow lacks `userGuid`, `AuthWrapper` redirects to `/session-error` (a minimal recovery page with a sign-out button that lives outside the `(web)` route group so it can't redirect-loop) instead of rendering a dead app with no sign-out control.
  - **Endpoint exposure — two layers, both load-bearing**: `src/app/api/auth/[...all]/route.ts` exports `allowedAuthRoutes`, a **deny-by-default allowlist** — better-auth 1.7.5 mounts 30 endpoints, our browser calls three (`GET /get-session`, `POST /sign-in/social` with its body restricted to `provider` + `callbackURL`, `GET /callback/ministryplatform`). Everything else 404s before reaching better-auth, including anything a future version adds. `disabledAuthPaths` in `src/lib/auth.ts` closes `/update-user` and its siblings via `disabledPaths` as defense in depth. **Do not relax either to make an unrelated failure go away**: `/update-user` let any authenticated user POST themselves another user's MP identity (GHSA-pqxp-c5mr-5398). Any future better-auth minor that renames routes must update the allowlist in the same commit, or sign-in 404s.
  - **Email is never an identity key**: better-auth's `email` column is required + unique, but **Ministry Platform enforces no uniqueness on email** — households share addresses. `mapMpProfileToUser` therefore stores a synthetic `<sub>@mp.invalid` value and puts the real address on the `mpEmail` field. **Never read `session.user.email` for display or mail — use `mpEmail` and handle `null`.** Implicit account linking is disabled and `emailVerified` reflects MP's own claim; together these stop a second MP user with a shared email inheriting the first user's identity.
  - **OIDC Logout**: Implements RP-initiated logout flow to properly end Ministry Platform OAuth sessions
    - **Refresh the cookie cache before `handleSignOut`**: the server action can read the session only from the one-hour JWT cookie cache (its in-memory store is empty), and without the session it cannot find the `id_token_hint`, so MP strands the user. The user menu calls `authClient.getSession()` first (`refreshSessionCookie` in `user-menu.tsx`), which runs in the route handler and re-issues the cookie. Any new sign-out caller must do the same. `/session-error` is the one known exception, and signs out without the hint (see `docs/OAUTH_LOGOUT_SETUP.md`)
  - **Required Environment Variables**: `MINISTRY_PLATFORM_BASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`
  - **MP OAuth Setup**: Requires Post-Logout Redirect URIs configured in Ministry Platform OAuth client (see README.md)
- **Validation**: Zod v4 (`zod@^4.5` — better-auth 1.7 requires `^4.5.4`) — note: different API from Zod v3 (e.g., `z.guid()` instead of `z.string().uuid()`, type imports via `z.ZodObject<z.ZodRawShape>`)

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
- **MP enum fields mirror MP, never our guess**: a hand-written union standing in for an MP enum must list the enum's real members (verify against the lookup table, not the Swagger). MP rejects an unknown member with an opaque **HTTP 500**, not a 400, so a wrong value reads as a server fault. Where a field is *conditionally* required, model it as a **discriminated union** so the compiler demands it, and re-check it in the service **above** `ensureValidToken()` so a doomed payload costs neither a token refresh nor a round trip. `CommunicationInfo` / `COMMUNICATION_TYPES` + `assertSendable` in `communication.service.ts` are the reference (#220).

## Feature Visibility & Access Control

Feature visibility in the home page and sidebar is controlled by RBAC (feature-to-User-Group mappings), not environment variables. Users only see features their User Groups grant access to. Admin users (in `ADMIN_USER_GROUP_IDS` groups) see all features plus the admin settings page.

## Key Development Practices

1. **Never manually edit generated files** - regenerate types using `npm run mp:generate:models`
2. **Report file changes** - after completing work, always report in chat which files were **created**, **modified**, or **removed**

## Timezone Handling — Ministry Platform Dates

MP stores and returns datetimes as **wall-clock values in US Central Time** with no zone marker. `new Date("2026-03-12")` parses as UTC, showing the wrong day in Central; `getHours()`/`getMinutes()` use server-local time, which is UTC in Docker. Full pattern reference: `.claude/references/ministryplatform.datetimehandling.md`.

**Use the shared utility** `src/lib/providers/ministry-platform/utils/mp-datetime.ts`:
- **Sending to MP**: `toMpSqlDatetime(value)` in the **service layer**, converting **after** Zod validation, not before. Accepts ISO instants (converted to Central), bare `YYYY-MM-DD` (Central midnight), zone-less datetime-local strings (treated as Central wall-clock), already-SQL strings (idempotent passthrough), and `Date` instances; throws on garbage instead of emitting `NaN`.
- **Reading from MP (arithmetic)**: `parseMpDatetime(value)` builds the true UTC instant for an MP wall-clock string — use for date diffs, age calcs, range checks. Do NOT use raw `new Date(mpString)`.
- **Reading from MP (display)**: format with `timeZone: getMpTimezone()` in `toLocaleDateString`/`Intl.DateTimeFormat` options (see `formatDateTime` in `contact-logs.tsx`), or for date-only fields in client components, `parseLocalDate()` (in `contact-lookup-details.tsx`) which builds browser-local midnight from the `YYYY-MM-DD` prefix.

**Date-only values — two live conventions, don't mix them per field**: the contact-log form sends noon UTC (`${date}T12:00:00.000Z`, see `contact-logs.tsx`), which converts to 06:00/07:00 Central same-day regardless of DST; a bare `YYYY-MM-DD` through `toMpSqlDatetime` becomes Central **midnight**. Both keep the calendar day correct — but pick one per field and stay consistent, since the stored times differ.

## Reference Documents

- **[Project Status](docs/status.md)** - Quick-reference snapshot of current state (read first at session start)
- **[Components Reference](.claude/references/components.md)** - Detailed inventory of all components, their purposes, server actions, and compliance status
- **[Ministry Platform Schema](.claude/references/ministryplatform.schema.md)** - Auto-generated summary of Ministry Platform database tables, primary keys, and foreign key relationships
- **[MP Datetime Handling](.claude/references/ministryplatform.datetimehandling.md)** - Wall-clock semantics, the `mp-datetime.ts` utility, read/write patterns per field type
- **[MP Query Syntax](.claude/references/ministryplatform.query-syntax.md)** - `$filter`/`$select` SQL-dialect rules, `_TABLE` FK traversal, groupBy/having, common error fixes
- **[Security Audits](.claude/notes/security-audit-2026-06-23.md)** - Newest full audit (2026-06-23); prior reports: [2026-05-21](.claude/notes/security-audit-2026-05-21.md) (superseded), [2026-02-24](.claude/notes/security-audit-2026-02-24.md)
