# Session Summary — 2026-02-20

## Fix: Production Image & MP Link Display (Issues #30, #31)

### Root Cause

`NEXT_PUBLIC_*` environment variables (specifically `NEXT_PUBLIC_MINISTRY_PLATFORM_FILE_URL` and `NEXT_PUBLIC_APP_NAME`) were referenced directly via `process.env` in `"use client"` components. In Next.js, `NEXT_PUBLIC_*` variables are **inlined at build time** into client-side JavaScript bundles. The Dockerfile's build stage doesn't set these variables, so they get baked in as `undefined` — even though they're available at runtime via docker-compose's `env_file`.

This caused:
- **Issue #30**: Volunteer profile images not showing (image URLs became `undefined/GUID?$thumbnail=true`)
- **Issue #31**: "View in MP" links not rendering (conditional check `mpBaseOrigin` was null, hiding the links)
- **Also affected**: Header avatar image, app name display, contact lookup images (dev-only)

Both worked fine in `npm run dev` because Next.js dev server reads env vars from `.env.local` at runtime.

### Solution: Runtime Config Context

Created a React context that passes server-read env vars to client components at runtime, bypassing the build-time inlining limitation.

**Architecture**:
1. Server component (`layout.tsx`) reads `process.env` at runtime (always works server-side)
2. Passes values as props to `Providers` (client boundary)
3. `RuntimeConfigProvider` context makes values available to all client components
4. Client components use `useRuntimeConfig()` hook instead of `process.env.NEXT_PUBLIC_*`

### Files Created
- `src/contexts/runtime-config-context.tsx` — `RuntimeConfig` interface, context provider, `useRuntimeConfig` hook

### Files Modified
- `src/contexts/index.ts` — Added barrel exports for runtime config context
- `src/app/providers.tsx` — Accepts `runtimeConfig` prop, wraps children with `RuntimeConfigProvider`
- `src/app/(web)/layout.tsx` — Reads env vars server-side, passes `runtimeConfig` to `Providers`
- `src/components/volunteer-processing/volunteer-card.tsx` — Uses `useRuntimeConfig()` for image URLs
- `src/components/volunteer-processing/volunteer-detail-modal.tsx` — Uses `useRuntimeConfig()` for image URLs and MP link construction
- `src/components/layout/header.tsx` — Uses `useRuntimeConfig()` for avatar image and app name
- `src/components/contact-lookup-details/contact-lookup-details.tsx` — Uses `useRuntimeConfig()` for image URLs
- `src/components/contact-lookup/contact-lookup-results.tsx` — Uses `useRuntimeConfig()` for image URLs

### Verification
- Production build (`npm run build`): ✅ Compiled successfully, all 9 routes generated
- ESLint (`npm run lint`): ✅ No new warnings (1 pre-existing unused import warning)
- No remaining `process.env.NEXT_PUBLIC_*` references in any client components

---

## Rename App to "MP Tools" (Issue #4)

Unified the app display name from inconsistent "Pastor App" / "MPNext" / "MPNextApp" to **"MP Tools"** across all occurrences.

### Files Modified
- `src/app/(web)/layout.tsx` — Page title "MP Tools", description "Ministry Platform Tools", fallback default
- `src/contexts/runtime-config-context.tsx` — Default context value
- `.env.example` — Default `NEXT_PUBLIC_APP_NAME=MP Tools`
- `DOCKER.md` — Example env var
- `README.md` — Example env var

## Close Issue #6 (Hide Unused Modules)

Already implemented — Contact Lookup and Template Tool gated behind `isDev` in sidebar and home page. Marked as completed in ideas.md.

---

## MP Auth: User Token Pass-Through (Issue #7)

### Problem

All MP API calls used the `MPNext` client credentials token, causing:
1. Audit logs attributed to "API User" instead of the logged-in user
2. Data access not scoped to user's MP permissions (any user could see whatever the API Client User could)
3. `$userId` query parameter not honored by MP for audit attribution

### Solution

Modified the full stack to use the logged-in user's OIDC access token for API calls.

**Core MP Layer (4 files):**
- `src/lib/providers/ministry-platform/client.ts` — Added `accessToken` option; skips client_credentials in user-token mode
- `src/lib/providers/ministry-platform/provider.ts` — Added `withAccessToken()` non-singleton factory
- `src/lib/providers/ministry-platform/helper.ts` — Constructor accepts `{ accessToken }`
- `src/lib/providers/ministry-platform/index.ts` — Type export

**Service Layer (6 services):**
- `src/services/volunteerService.ts` — `getInstance(accessToken?)`, `bgStatusCache` made static
- `src/services/contactLogService.ts`, `contactService.ts`, `userService.ts`, `toolService.ts`, `dashboardService.ts` — Same `getInstance(accessToken?)` pattern

**Server Actions (6 files + 1 shared):**
- `src/components/volunteer-processing/actions.ts` — All 14 actions pass `session.accessToken`
- `src/components/contact-logs/actions.ts` — 6 actions + 2 fallback MPHelper calls
- `src/components/contact-lookup/actions.ts` — Added auth check + token
- `src/components/contact-lookup-details/actions.ts` — Added auth checks + token
- `src/components/user-tools-debug/actions.ts` — Token pass-through
- `src/components/shared-actions/user.ts` — Added auth() call + token

**Exceptions (remain on client credentials):**
- Dashboard `unstable_cache` callbacks (no user context available)
- JWT callback in `auth.ts` (runs during login)

### Testing
- 150 tests pass, production build succeeds

---

## CLAUDE.md: Incorporate Missing Upstream PR #42 Additions

The earlier upstream PR review marked PR #42's CLAUDE.md changes as "N/A (our docs already diverged)" but several additions were applicable to our fork.

### Additions from upstream CLAUDE.md
- **Next.js 16 Notes** section — proxy pattern, Turbopack defaults, ESLint config, async dynamic APIs, dev output location
- **Architecture** — Services Layer and Contexts bullets
- **Data Flow** section — Component → Action → Service → MPHelper → API
- **Code Style** — Services entry in Ministry Platform Structure
- **Import Patterns** — Service class and React context import examples
- **Key Practices #9** — "Use service classes in server actions"
- **Commands** — Turbopack note on Build, `next lint` removal note on Lint, Setup commands

### Intentionally skipped
- Zod v4 note — upstream is on `zod@^4.3`, we're on `zod@^3.25.32`

### Files Modified
- `CLAUDE.md` — All additions above, updated PR #42 review table note

---

## Upgrade Major Dependencies: Zod v4, openai v6, dotenv v17

Upgraded three major dependencies that were deferred from upstream PR #41.

### Package Versions
| Package | Before | After |
|---------|--------|-------|
| `zod` | `^3.25.32` | `^4.3.6` |
| `openai` | `^5.5.0` | `^6.22.0` |
| `dotenv` | `^16.5.0` | `^17.3.1` |

### Zod v4 Migration Details

**Key change: `z.string().uuid()` → `z.guid()`**
- Zod v4's `z.uuid()` enforces strict RFC 4122 (version + variant bits), which would reject Ministry Platform GUIDs
- `z.guid()` is the lenient replacement matching v3's `z.string().uuid()` behavior
- Updated generator script (`generate-types.ts:276`) and 10 generated schema files

**Kept deprecated-but-working v3 chain forms:**
- `z.string().email()`, `z.string().url()`, `z.string().datetime()` — still work in v4, preserve `.max()` chaining

**Type import change:**
- `helper.ts:18` — `import type { ZodObject, ZodRawShape } from "zod"` → `import { z } from "zod"` with `z.ZodObject<z.ZodRawShape>`

**No changes needed:**
- `contact-logs.tsx` hand-written schema — uses `z.object()`, `z.string()`, `z.number()` (all unchanged in v4)
- `helper.test.ts` test schemas — same patterns
- `openai` — not imported anywhere in codebase (phantom dependency)
- `dotenv` — only used via `dotenv.config({ path })` in generator, API compatible

### Files Modified
- `package.json` — Bumped zod, openai, dotenv
- `package-lock.json` — Updated lockfile
- `src/lib/providers/ministry-platform/scripts/generate-types.ts:276` — `z.string().uuid()` → `z.guid()`
- `src/lib/providers/ministry-platform/helper.ts:18` — Zod type import change
- 10 generated `*Schema.ts` files — `z.string().uuid()` → `z.guid()`
- `CLAUDE.md` — Updated PR #41 status from Partial to Incorporated

### Verification
- 150 tests pass
- Production build succeeds (TypeScript + Turbopack)
- ESLint: 0 errors, 1 pre-existing warning

---

## Bump All Remaining Dependency Pins to Match Upstream

Comprehensive audit of upstream PRs #37-42 revealed 24 dependency pins that were lower than upstream targets. Bumped all to match.

### Dependencies (24 total)

**Production dependencies:**
| Package | Before | After |
|---------|--------|-------|
| `@hookform/resolvers` | `^5.0.1` | `^5.2.2` |
| `@radix-ui/react-alert-dialog` | `^1.1.14` | `^1.1.15` |
| `@radix-ui/react-avatar` | `^1.1.10` | `^1.1.11` |
| `@radix-ui/react-checkbox` | `^1.3.2` | `^1.3.3` |
| `@radix-ui/react-dropdown-menu` | `^2.1.15` | `^2.1.16` |
| `@radix-ui/react-label` | `^2.1.7` | `^2.1.8` |
| `@radix-ui/react-radio-group` | `^1.3.7` | `^1.3.8` |
| `@radix-ui/react-select` | `^2.2.5` | `^2.2.6` |
| `@radix-ui/react-slot` | `^1.2.3` | `^1.2.4` |
| `@radix-ui/react-switch` | `^1.2.5` | `^1.2.6` |
| `@radix-ui/react-tooltip` | `^1.2.7` | `^1.2.8` |
| `lucide-react` | `^0.563.0` | `^0.575.0` |
| `tsx` | `^4.19.4` | `^4.21.0` |

**Dev dependencies:**
| Package | Before | After |
|---------|--------|-------|
| `@tailwindcss/postcss` | `^4` | `^4.2.0` |
| `@tailwindcss/typography` | `^0.5.16` | `^0.5.19` |
| `@types/node` | `^22` | `^25.3.0` (major) |
| `@types/react-dom` | `^19` | `^19.2.3` |
| `@vitejs/plugin-react` | `^5.1.2` | `^5.1.4` |
| `chalk` | `^5.3.0` | `^5.6.2` |
| `jsdom` | `^27.4.0` | `^28.1.0` (major) |
| `postcss` | `^8.5.3` | `^8.5.6` |
| `tailwindcss` | `^4.1.7` | `^4.2.0` |
| `tw-animate-css` | `^1.3.0` | `^1.4.0` |
| `typescript` | `^5` | `^5.9.3` |

### Additional Changes
- **CLAUDE.md** — Added Zod v4 Validation bullet to Architecture section; updated PR #38 and #41 review table notes to reflect full incorporation
- **next-env.d.ts** — Auto-regenerated by build (path is `.next/types/` for `next build`, `.next/dev/types/` for `next dev`)

### Files Modified
- `package.json` — All 24 dependency pin bumps
- `package-lock.json` — Updated lockfile (22 packages changed, 6 added, 1 removed)
- `CLAUDE.md` — Zod v4 Validation bullet, updated review table

### Verification
- 150 tests pass
- Production build succeeds (TypeScript + Turbopack, 9 routes)
- ESLint: 0 errors, 1 pre-existing warning
