# Session Summary — 2026-10-01

## Stable Server Actions encryption key — COMPLETED on branch (branch `chore/server-actions-encryption-key`)

**Problem.** Next.js derives every Server Action ID from `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` at build time. mp-charts never set it, so each Docker build generated a random key and renamed every action. A tab opened before a deploy then failed its next action with "Failed to find Server Action" until reloaded, and sign-out (`handleSignOut`) is one of those actions. event-manager and mp-senior-care fixed this long ago. music-tools has the same symptom and is being done separately.

**Change (ported from event-manager / mp-senior-care):**
- `Dockerfile`: the builder's `npm run build` step mounts an **optional** BuildKit secret `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` and exports it only if the file exists. The step is identical to the siblings'; the comment is expanded.
- `.github/workflows/docker-build-push.yml`: `secrets:` is added to the `build-scan-and-push` image build only. `verify`, which also runs for Dependabot, keeps no secrets, and comments now say why.
- `.env.example`: the siblings' comment block, plus a line saying both values must match and local dev leaves it blank.
- `DOCKER.md` § Server Actions encryption key (what it fixes, where to set it, how to generate it, what happens without it or when it changes, the cache caveat, a check that prints only match/mismatch, exposure); a GitHub-secrets table row; a pointer under Environment Variables. `README.md`: the env block and production checklist. `CLAUDE.md`: a Next.js 16 note.

**Measured (Next 16.3.8, 89 actions):**
- Two clean `next build`s without a key shared **0 of 89** action IDs. A blank value behaved the same: 0 of 89, and the build succeeded.
- Two with the same test key shared **89 of 89**; a third key changed them all.
- A standalone server from a rebuild with the same key **recognised** the previous build's sign-out ID. The ID from a keyless build got `404` + `x-nextjs-action-not-found: 1` and a logged "Failed to find Server Action". Starting that server with a *different* runtime key did not affect ID lookup.
- Next writes the key verbatim into `.next/server/server-reference-manifest.json` (and the standalone copy), so the image carries it.
- Docker (local daemon, native arm64): the build succeeds with and without `--secret`. With the secret, the image carries that key and gives the same IDs as a local build with it. The test key does not appear in `docker history` or the image `ENV`.
- **Found: BuildKit's cache ignores the secret.** A `--secret` build over a context already built without one came out `CACHED` and shipped the old, keyless key. A second build with a different key did the same. Only `--no-cache-filter builder` picked the new key up.
- `docker/build-push-action@v7` (actions-toolkit `parseSecretKvp`) turns an unset repo secret (`NAME=`) into a warning, "… is not a valid secret", and skips it. The build is unaffected.

**Decisions.**
- Kept the siblings' mechanism exactly; no fingerprint build-arg and no `no-cache-filters: builder`. The cache caveat is documented and handled by ordering instead: the GitHub secret must exist **before** this branch's first push. That push rebuilds the builder layer anyway, because the `RUN` text changed.
- No unit test. Per `.claude/rules/testing.md` this is a Dockerfile and CI change, not testable code. Verification is the build matrix and the HTTP probe above.

**Follow-ups.**
- Operator: set the GitHub Actions secret and the runtime env value, with the same value, before pushing.
- Family-wide: the cache caveat applies equally to event-manager and mp-senior-care if they ever rotate the key.
