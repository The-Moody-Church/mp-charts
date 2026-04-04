# Session Summary — 2026-04-04

## Objectives

- Update GitHub Actions to Node.js 24 runtime (deprecation deadline June 2, 2026)
- Fix npm audit vulnerabilities
- Migrate mp-charts deployment from ironside to TMC1

## Work Completed

### GitHub Actions Node.js 24 Update ✅ COMPLETED

- **PR #151**: Updated all actions to latest major versions with Node.js 24 support
  - `actions/checkout` v4 → v5
  - `docker/setup-buildx-action` v3 → v4
  - `docker/login-action` v3 → v4
  - `docker/build-push-action` v6 → v7
  - `aquasecurity/trivy-action` @master → v0.35.0 (pinned for supply chain security)
  - `actions/github-script` v7 → v8
- Also fixed npm audit vulnerabilities in the same PR:
  - `defu` 6.1.4 → 6.1.6 (prototype pollution via `__proto__`, high severity)
  - `brace-expansion` patches (ReDoS hang, moderate severity)
- Closed Dependabot PR #150 (superseded — defu fix included in #151)

### Skip Docker Build on Dependabot PRs ✅ COMPLETED

- **PR #152**: Added `if: github.actor != 'dependabot[bot]'` to the `build-scan-and-push` job
- Dependabot PRs don't have access to repo secrets, so Docker login always fails
- The full build still runs on merge to main

### TMC1 Migration ✅ COMPLETED

- Deployed latest image to TMC1 (192.168.5.222) — cache warming successful
- Copied data files from ironside to TMC1 via `docker cp` + alpine container for ownership fix:
  - `compliance-tools.json`
  - `feature-access.json`
  - `feedback-config.json`
  - `journey-tools.json`
- Updated `/deploy` command to target TMC1 (context `tmc1`, IP `192.168.5.222`)

## Files Changed

- `.github/workflows/docker-build-push.yml` — action versions + dependabot skip
- `.github/workflows/sync-issues-to-ideas.yml` — checkout v5, github-script v8
- `package-lock.json` — defu, brace-expansion patches
- `.claude/commands/deploy.md` — updated to TMC1 (local-only, gitignored)
- `docs/status.md` — updated with today's work
- `docs/sessions/session-summary-2026-04-04.md` — this file

## Decisions

- Pinned `trivy-action` to `v0.35.0` instead of `@master` due to March 2026 supply chain compromise incident
- Remaining `actions/cache` Node.js 20 warning is from an internal dependency of `docker/setup-buildx-action` — not directly controllable, will resolve upstream

## Follow-ups

- Monitor for `actions/cache` update in `docker/setup-buildx-action` to fully eliminate Node.js 20 warnings
- Ironside mp-charts container can be stopped/removed once TMC1 deployment is confirmed stable
