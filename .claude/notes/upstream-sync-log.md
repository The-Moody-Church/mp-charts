# Upstream Sync Log

This fork tracks `MinistryPlatform-Community/MPNext`. Upstream changes are reviewed periodically and cherry-picked selectively — we do **not** merge upstream directly, since the fork has intentionally diverged (e.g., Next.js 16 — upstream recently upgraded to 16 as well).

## How to Check for Upstream Changes

```bash
git fetch upstream
git log main..upstream/main --oneline
```

Or review PRs at: https://github.com/MinistryPlatform-Community/MPNext/pulls

## Review: 2026-07-10

Reviewed upstream PRs #56–#66 (all merged upstream since the 2026-04-08 review). Our fork already leads or matches upstream on security/timezone/audit work, so only the better-auth 1.6 session-integrity fix (PR #66) was genuinely needed.

| PR | Title | Action | Notes |
|----|-------|--------|-------|
| #56 | VS Code Peacock color settings | Skipped | Personal editor settings, not app code |
| #57 | Sanitize filter parameters (injection) | Already incorporated | We already have `sanitizeFilterValue`/`sanitizeIds`/`sanitizeIdsOptional`/`sanitizeId`/`sanitizeGuid` in `filter-sanitize.ts` + CI security-lint. Authored upstream by jonnydcakes; our fork pioneered this |
| #59 | Resolve npm audit vulnerabilities | Already incorporated | Our deps already patched via PR #191 + prior audits; `npm audit` shows only 1 moderate (transitive `brace-expansion` under `@typescript-eslint`) |
| #60 | React 19 Suspense refactor + template tool removal | Skipped (divergent) | Upstream's user-context/contact-lookup Suspense refactor and template-tool removal target their architecture; our fork uses `UserProvider`/PPR patterns that have diverged. Not ported — revisit if we touch those areas |
| #61 | Expand filter sanitization to remaining GUID sites + LIKE wildcards | Already incorporated | We already have `sanitizeLikeValue()` (neutralizes `%` `_` `[` wildcards) and sanitize all GUID sites |
| #62 | MP query syntax reference doc | Skipped (optional) | Documentation only; we have our own MP REST notes in CLAUDE.md. Low value to port |
| #63 | Contact-logs timezone handling on Contact_Date | Already incorporated | We have `isoToCentralSql()` (America/Chicago) in `contactLogService.ts` — see CLAUDE.md "Timezone Handling" |
| #64 | Attribute MP writes to acting user via session context | Already incorporated | We already thread `$userId` through service writes (21+ call sites) for audit attribution |
| #66 | **Better Auth 1.6 session-integrity repair** | **Incorporated** | **Live bug in our fork.** better-auth 1.6's `parseAdditionalUserInputFromProviderProfile` strips additional fields declared `input: false` before user creation. Our `userGuid`/`mpUserId`/`mpContactId` were all `input: false` and populated server-side → all three dropped on login (blank avatar, dead user menu, `userId: null`, broken `$userId` audit). Adapted upstream's userGuid-only fix to all **three** of our fields; extracted `userAdditionalFields` const with warning comment; added `/session-error` recovery route + `AuthWrapper` guard; added `src/lib/auth.test.ts` + `auth-wrapper.test.tsx` guards. Upstream also moved to lazy `resolveMpUserId` in customSession — we kept our stored-field approach (less divergence) |

Deps note: PR #66 also bundled a lockfile security refresh (undici, vite, esbuild, js-yaml, etc.) which we largely already have. The 1 remaining moderate (`brace-expansion` GHSA-jxxr-4gwj-5jf2, transitive dev-only under `@typescript-eslint`) is deferred — `npm audit fix` resolves it but it's not runtime-exploitable.

## Last Review: 2026-04-08

Reviewed all open/merged upstream PRs through PR #55. Status:

| PR | Title | Action | Notes |
|----|-------|--------|-------|
| #37 | Security patches (Next.js + React) | Incorporated | Already on Next.js 16; `react`/`react-dom` at `^19.2.4` exceeds the `≥19.1.0` pin |
| #38 | Dependency version updates | Incorporated | Bumped minimum pinned versions for all packages including lucide-react |
| #39 | sanitizeTypeName digit-leading fix | Already incorporated | Same fix as #40; our `sanitizeTypeName` already prefixes `_` for digit-leading names |
| #40 | Generator fix for digit-leading names | Incorporated | `sanitizeTypeName` prefixes `_` when result starts with a digit |
| #41 | Upgrade to Next.js 16 + all deps | Incorporated | Already on Next.js 16; cherry-picked: `middleware.ts` → `proxy.ts` rename, removed unused `@eslint/eslintrc`. Bumped all deps to match upstream pins: zod v4, openai v6, dotenv v17, @types/node ^25, jsdom ^28, all Radix UI, tailwindcss ^4.2, typescript ^5.9.3, and 10+ more |
| #42 | Docs + `@inquirer/prompts` v8 | Incorporated | Upgraded `@inquirer/prompts` ^7→^8; updated `components.md` layout import patterns. Cherry-picked CLAUDE.md additions: Next.js 16 Notes section, Services Layer + Contexts in Architecture, Data Flow section, service import patterns |
| #45 | Improve test coverage (137→228 tests) | Skipped | Our test suite has diverged; upstream tests cover different features |
| #46 | Testing reference guide | Skipped | We have our own testing docs and patterns |
| #47 | GitHub Actions test workflow + Codecov | Skipped | Upstream-specific CI infrastructure |
| #49 | Restore CODECOV_TOKEN | Skipped | Only relevant with #47 |
| #50 | Load user roles/groups into MPUserProfile | Incorporated | Added `roles`/`userGroups` to MPUserProfile, parallel fetch from `dp_User_Roles`/`dp_User_User_Groups`; kept our `sanitizeGuid()` + `sanitizeIds()` security (upstream doesn't sanitize); kept `requireSession()` in shared action |
| #51 | Update deps + fix security vulns | Incorporated | `npm audit fix` resolved 3 CVEs: rollup CVE-2026-27606 (High), minimatch GHSA-3ppc-4f35-3m26 (High), ajv GHSA-2g4f-4pwh-qvx6 (Moderate). Lockfile-only changes, no `package.json` updates needed |
| #52 | Replace NextAuth refs with Better Auth | Incorporated | Code already aligned (env vars, function names). Cherry-picked: `totalSteps` 10→9 fix in `setup.ts`; updated stale NextAuth references in `docs/OAUTH_LOGOUT_SETUP.md` and `src/lib/providers/ministry-platform/docs/README.md` |
| #54 | Fix vulnerabilities and update dependencies | Incorporated | Updated 10 package.json version pins + regenerated lockfile. Security: flatted DoS, undici 6 CVEs, Next.js 16.1.6→16.1.7 (5 moderate CVEs). Deps: better-auth ^1.5.5, openai ^6.32.0, vitest ^4.1.0, jsdom ^29.0.0, and 6 more. 0 audit vulnerabilities, 236 tests pass |
| #55 | Add mandatory MP data safety rule to CLAUDE.md | Incorporated | Added "Ministry Platform Data Safety" section to `.claude/rules/security.md` requiring explicit user confirmation before any MP write operation. Adapted from upstream's CLAUDE.md addition to fit our rules file structure |

**GitHub will show "N commits behind"** — this is expected and harmless. It reflects diverged commit history, not missing changes.
