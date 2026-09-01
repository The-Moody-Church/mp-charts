# Upstream Sync Log

This fork tracks `MinistryPlatform-Community/MPNext`. Upstream changes are reviewed periodically and cherry-picked selectively — we do **not** merge upstream directly, since the fork has intentionally diverged (e.g., Next.js 16 — upstream recently upgraded to 16 as well).

## How to Check for Upstream Changes

```bash
git fetch upstream
git log main..upstream/main --oneline
```

Or review PRs at: https://github.com/MinistryPlatform-Community/MPNext/pulls

## Review: 2026-09-01

Reviewed upstream PRs #67–#78 (all merged upstream since the 2026-07-10 review; evaluated per-PR against our tree with `git apply --check` dry runs). The fork again led upstream on most security work — the genuinely-needed adoptions were the #77 token-lifetime fix (live bug here, worse than upstream: singleton + 117 `getInstance()` call sites), the #75 `sanitizeId` idiom pass, and #67's better-auth range pin.

| PR | Title | Action | Notes |
|----|-------|--------|-------|
| #67 | Security advisory deps + test-fixture repair | Already incorporated (deps) / **pin adopted** | Every advisory it cites is patched at ≤ next 16.2.11; we're on 16.3.0. Our test fixtures never had the bug. **Real takeaway adopted: `better-auth` pinned `>=1.6.23 <1.7.0`** — the old caret admitted 1.7.x, which removes `genericOAuth`/`genericOAuthClient`/`signIn.oauth2` (our only sign-in path) and moves the OAuth callback URL (would require MP-side redirect-URI re-registration). A routine minor bump would have broken production login |
| #68 | better-auth 1.7 migration (genericOAuth → social provider) | **DEFERRED** | Breaking migration we will eventually owe; this PR is the authoritative guide. Needs its own branch: 3 diverged files here (providerId, MP-lookup `getMpUserInfo`, 3-field `mapProfileToUser`), MP OAuth-client redirect-URI re-registration in every environment, and a live sign-in soak. The #67 pin makes deferral safe |
| #69 | Dependency audit (32 in-range updates, drop `openai`) | Partially adopted (deps PR) | We already match or exceed most of the post-#69 tree; `openai` was never here. Residual patch-level drift (vitest, tsx, react-hook-form, @hookform/resolvers, eslint-config-next) folded into the separate 2026-09 deps PR via local `npm update` — never port upstream's lockfile |
| #70 | deps-known-issues note: TS 7 blocked by typescript-eslint | Skipped | Upstream state-file bookkeeping for a file we don't carry; we're on TS 5.9 headed to 6.x, so a TS-7-only blocker gates nothing |
| #71 | Test suite expansion + TODO docs | Skipped | Test suites diverged long ago (ours larger and independently authored); its 8 documented defects: 5 already fixed here, 2 architecturally moot, 1 (client.ts `expires_in`) fixed via #77 below. Carry-forward logged in ideas.md: vitest coverage.include blind spot |
| #72 | Lockfile repair (ajv de-hoist, @emnapi subtree) | Already incorporated | We fixed the identical ajv EUSAGE break in `7128864` on 2026-08-07 — two weeks before upstream; the @emnapi drift mechanism (Windows installs) never applied here |
| #73 | searchContacts session gate + user-profile ownership | Already incorporated | Fork led via `fcfb5ae` (2026-06-24): `requireFeatureAccess` + rate tiers vs upstream's bare session check; `getCurrentUserProfile` already session-bound. Vestigial `_requestedId` params logged in ideas.md |
| #74 | Lockfile drift guard (pre-commit hook + CI job) | Skipped | Premise not applicable: our `verify` job runs `npm ci` on every push for every actor (incl. dependabot), plus the Docker build's `npm ci` and the nightly audit — drift cannot reach main unnoticed |
| #75 | Contact-log authorization service + ID validation | **Adapted** (idiom pass only) | Upstream's `MP_WRITE_SECURITY_ROLES` authorization NOT adopted — any-role-may-edit-any-log is looser than our `Made_By` ownership model and would be a regression. Adopted the residual: 9 action-layer `!id \|\| id <= 0` guards → `sanitizeId()` (React Flight args are type-erased), `sanitizeId` added to `contactLogService.updateContactLog`/`deleteContactLog`, `Number.isInteger` → `Number.isSafeInteger` in `sanitizeId` (the string path was silently coercing `"9007199254740993"` to the wrong record ID), boundary + injection regression tests |
| #76 | Contact-log types N+1 fix | Already incorporated | Fork fixed the same N+1 in `e6ba834`, before upstream; our version also batches the `Made_By` dp_Users lookup. `logs.some()` micro-guard logged in ideas.md |
| #77 | **Honor `expires_in` instead of capping tokens at 5 min** | **Incorporated** | **Live bug here, amplified**: provider is a singleton with 117 `getInstance()` call sites + cache-warm bursts, so every 1-hour MP token was discarded after 5 minutes (~12× token requests). `auth/client-credentials.ts` + rewritten `client.test.ts` were byte-identical to upstream's base → clean checkout from `664adff`; `client.ts` hand-ported around our `isUserToken` dual-mode (upstream's `console.log` deliberately not reintroduced). Added fork-only user-token-mode regression test. Mutation-verified: restoring the flat cap fails the 4 lifecycle tests |
| #78 | next 16.3.3 security bump (AVIF RCE, Windows RCE) | Adopted (deps PR) | Neither RCE currently reachable here (all 6 `<Image>` sites pass `unoptimized`, no `images` config) but `/_next/image` is auth-exempt in `proxy.ts`, so the optimizer is unauthenticated-reachable if a future call site drops `unoptimized` — patched in the separate 2026-09 deps PR |

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
