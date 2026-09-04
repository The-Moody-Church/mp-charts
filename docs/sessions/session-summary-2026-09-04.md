# Session Summary — 2026-09-04

## Objective

Move the app's Node runtime from **Node 22 (maintenance LTS, EOL 2027-04-30)** to **Node 24 LTS
("Krypton", EOL 2028-04-30)** and pin it, so the version stops drifting across dev / CI / production.

**Status: COMPLETED** — shipped as PR #216. Soaked on TMC1 as `:dev`, user-verified on production
hardware, then merged and returned to the released image.

## Why

The runtime was declared in **six** places with **four different values** and nothing reconciling them:

| Where | Was | Now |
|---|---|---|
| Local dev machine | 26.7.0 (Homebrew, no version manager) | unchanged — `engines` is a floor, not a pin |
| `Dockerfile` deps/builder/runner | `node:22-alpine` ×3 | `node:24-alpine` ×3 |
| `Dockerfile.dev` | `node:22-alpine` | `node:24-alpine` |
| `docker-build-push.yml`, `audit-nightly.yml` | `node-version: 22` ×2 | `node-version-file: .nvmrc` ×2 |
| `scripts/setup.ts:77` | `REQUIRED_NODE_VERSION = 20` | `24` |
| `README.md:79` | "v22 or higher (v20.9+ minimum)" | "v24 LTS" |
| `.github/dependabot.yml:9` | comment: `node:20-alpine` (stale since Feb 2026) | `node:24-alpine` |

Two things made it worth doing rather than tolerating:

- **`npm audit --audit-level=high` is a hard deploy gate** and has caused three production freezes
  (2026-07-10, the 27-day one found 2026-08-06, 2026-08-17). It was being judged by **npm 10.9.8** in
  CI while local ran **npm 11.19.0**. Node 24 bundles **npm 11.x**, so the gate is now judged by the
  same npm major the developer runs. (Precisely: 11.19.0 in the Docker image, 11.17.0 on the GitHub
  runner, whose tool cache holds Node 24.19.0 — so "identical to local" would be overstating it.
  The material change is 10.9.8 → 11.x.)
- **Local dev sat 4 majors ahead of production** with nothing flagging it, and `tsconfig.json`'s
  `lib: esnext` meant TypeScript couldn't catch it either.

## Decisions + rationale

- **24, not 26.** 24 is LTS today; 26 doesn't become LTS until 2026-10-28. Noted for later: 24 leaves
  *active* LTS on **2026-10-20** when 26 takes over, though it stays security-supported to April 2028.
  Pinning makes that a one-line change.
- **No dependency actually required 24.** 0 of the 383 packages declaring `engines.node` fail on 24 —
  but 0 fail on 26 either. The real floor is **22.13.0** (`kysely@0.29.4` at `>=22.0.0`, a *production*
  dep via `better-auth`, intersected with `@inquirer/*`). This was a support-lifecycle decision, same
  reasoning as the 20→22 bump on 2026-02-14. Recorded so nobody later mistakes it for a forced upgrade.
- **`engines.node` is floor-only (`>=24.0.0`), no ceiling.** There is no version manager on the dev
  machine (no nvm/fnm/volta/asdf/mise — Homebrew `node` only), so a `<25` ceiling would fire an
  EBADENGINE warning on every local install forever. A permanently-firing warning gets ignored.
- **No `.npmrc` / `engine-strict=true`** for the same reason — it would hard-fail local `npm ci` with
  no way to switch Node.
- **`@types/node` pinned to the container's major (`^25.5.0` → `^24.13.3`)** — this is the real drift
  guardrail, and unlike `engines` it works regardless of local Node: a Node 25/26-only API now fails
  `tsc` instead of surfacing at runtime on TMC1.
- **`.nvmrc` + `node-version-file`, not `.nvmrc` alone.** Neither workflow used `node-version-file`,
  so adding `.nvmrc` by itself would have been *silently ignored by CI* and become a seventh source
  of truth. Verified setup-node parses a bare `24` from plain text (`src/util.ts` regex
  `/^(?:node(js)?\s+)?v?(?<version>[^\s]+)$/m`). Deliberately **not** pointed at `package.json` —
  setup-node would read `engines.node` and a floor-only `>=24.0.0` resolves to the *newest* Node (26).
- **`scripts/setup.ts` regex left alone.** The major-only parse at `:333` was the reason Node v20.0.0
  passed a check whose message claimed v20.9. At a clean major boundary, major-only is now correct —
  so the fix was to drop the misleading `.9` wording, not to add minor parsing.

## Bundled fix — loopback hardening (`src/instrumentation.ts:27`)

`localhost` → `127.0.0.1` in the cache-warm self-fetch. The server binds `HOSTNAME=0.0.0.0`
(IPv4-only) while Node's `verbatim` DNS default (since Node 17) can resolve `localhost` to `::1`
first → `ECONNREFUSED`. Cache warming **fails soft** (10 retries, one `console.error`), so the
symptom would have been every user hitting 30s cold fetches after a restart with nothing obviously
broken. Alpine's `/etc/hosts` currently avoids this, but that's an environment property — exactly
what a base-image change perturbs. Bundled here deliberately: the `:dev` soak's cache-warming check
validates the runtime bump and this fix at once.

## Verification (local, complete)

Split three ways since there is no local Node 24:

- **On Node 26 (runtime-independent):** `npx tsc --noEmit` **0 errors** (the `@types/node` downgrade
  was a non-event), `npm run lint` clean, **664 tests / 46 files pass**, `npm audit --audit-level=high`
  → 0 vulnerabilities (an npm 11 run, so it pre-verifies the CI gate).
- **In Docker on real Node 24** (built with an explicit `--context desktop-linux` — the active context
  was `tmc1`, i.e. production): build succeeded, so the **Turbopack-on-Alpine** path is fine (it broke
  once before, 2026-02-16). Runtime probe: `v24.20.0`, V8 13.6, ABI `modules` 137, **ICU 78.3**,
  `America/Chicago` resolves and DST is correct (Jan → CST −6, Jul → CDT −5) — the full-ICU
  requirement `mp-datetime.ts` and the 6 AM CT scheduler depend on. Confirmed the runner stage still
  ships **no npm**.
- **Base image size delta: +0.8 MB** (58.1 → 58.9 MB), so the bump is size-neutral.
- **No native-module risk confirmed:** all native deps are N-API prebuilts, so ABI 127 → 137 needs no
  rebuild and there is no `node-gyp` in the image. (Correction to an earlier note: `esbuild`,
  `fsevents` and `unrs-resolver` *do* have install scripts — they are transitive, and all three are
  prebuilt-binary selectors, not compiles.)

## Files changed

**Runtime pin:** `.nvmrc` (new), `Dockerfile` (`:4`, `:12`, `:27`), `Dockerfile.dev` (`:4`),
`.github/workflows/docker-build-push.yml` (`:59`), `.github/workflows/audit-nightly.yml` (`:39`),
`package.json` (`engines`, `@types/node`), `package-lock.json`, `scripts/setup.ts` (`:77` + two messages).

**Code:** `src/instrumentation.ts` (`:27`).

**Docs:** `README.md` (`:79`, `:97`), `DOCKER.md` (`:249`, `:403`), `.github/dependabot.yml` (`:9`),
`CLAUDE.md` (new "Node Runtime" section), `docs/ideas.md` (2 new Technical Debt entries),
`docs/status.md`, this file.

**Deliberately untouched:** `docs/sessions/**` (incl. `archive/`) — their `node:20`/`node:22`
references are correct history.

## Deferred to `docs/ideas.md`

- **Digest-pin the Docker base images** — all four `FROM` tags stay mutable, so the shipped Node patch
  level is still unrecorded and `:latest`/`:main`/`:dev` can each differ. Compounded by Trivy's
  `ignore-unfixed: true`.
- **`cache-handler.js` depends on private Next.js internals** — two `next/dist/**` deep imports plus
  the undocumented `revalidate: -1` SWR signal. A Next minor can break it; a Node bump cannot.

## Soak result (TMC1, `:dev`, 2026-09-04)

Deployed over `:main` (which had been running since 2026-09-01) and verified on production hardware:

| Check | Result |
|---|---|
| Running image / digest | `:dev` @ `sha256:c5da2273…` — matched the branch SHA exactly |
| **Node in the container** | **v24.20.0** (was 22.x) |
| ICU / Central time | 78.3 / `Sep 4, 2026, 8:35 AM` correct |
| Cache warming | **5/5 succeeded, 0 failed, attempt 1**, 33.7s total |
| Daily re-warm scheduled | 21.4h → 6:00 AM CT |
| HTTP | `GET /` → 307 → `/signin?callbackUrl=%2F` |

Two of those are the load-bearing ones. **"attempt 1"** means the cache-warm self-fetch connected
without a single retry — the `localhost` → `127.0.0.1` fix working under the new base image, and the
one failure here that would have been silent. And the **6:00 AM CT** reschedule proves full ICU with
correct DST math survived the base-image change, which `mp-datetime.ts` and the scheduler depend on.

## Follow-ups

- [x] `:dev` soak on TMC1 + user manual test pass — **passed**. See "Soak result" below.
- [x] Verified `:dev`'s digest matched the branch SHA before deploying (`sha256:c5da2273…`), and that
      no `main` build had landed after ours — the check `/deploy-dev` itself cannot make, since it
      filters `main` out of its own CI lookup.
- [x] Merged with `--merge`, then returned production to the released image.
- [ ] **Revisit ~2026-10-20**, when Node 24 leaves active LTS and 26 becomes the active LTS.
