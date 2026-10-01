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
- Kept the siblings' mechanism exactly; no fingerprint build-arg and no `no-cache-filters: builder`. The cache caveat is documented and handled by ordering instead: the GitHub secret must exist **before** this branch's first push. That push rebuilds the builder layer anyway, because the `RUN` text changed. (The secret was not set in time; see Follow-ups for the recovery.)
- **Source test for the wiring: `src/server-actions-key-wiring.test.ts`** (2 tests), in the same style as the `check:shells` wiring check in `src/app/layout.test.tsx`. Both halves of this fix fail silently: without them the image still builds, with a throwaway key. The test pins the Dockerfile's single `RUN` (secret mount, `if [ -f … ]`, `export` from the secret file, `npm run build`), forbids `ARG`/`ENV` for the key and `required=true`, requires the `secrets:` input on `build-scan-and-push`, and forbids both a `secrets:` input and any `${{ secrets.… }}` expression in `verify`. Mutation-checked seven ways, each failing exactly one of the two tests: the `RUN` replaced by a plain `npm run build`; the `export` line alone removed; the push job's `secrets:` removed; `secrets:` added to `verify`'s image build; a `secrets.*` env added to `verify`'s Build step; `ARG NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` in the builder stage; `required=true` on the mount. Files restored byte for byte (shasums matched).

**Review fixes (same branch, before the first push).**
- `.dockerignore` scope corrected in `DOCKER.md` and `CLAUDE.md`. They said a docs-only commit leaves the Docker context unchanged. That holds only for `.github/`, `.claude/` and root-level `*.md` other than `README.md`: `*.md` matches only the context root and `!README.md` re-includes README, so `README.md` and all of `docs/**` are in the context. Measured with the repo's `.dockerignore` and a `COPY . /ctx; RUN find /ctx -type f` probe: `README.md`, `docs/status.md` and `docs/sessions/s.md` were copied; `CLAUDE.md`, `DOCKER.md`, `.claude/` and `.github/` were not. Every PR here edits `docs/`, so a typical PR re-runs `npm run build` with the current secret.
- The no-test decision was reversed (see the test bullet above).
- `status.md`: the #244 row said "open — soak first"; #244 merged on 2026-10-01 (`ec5ea9a`).
- Re-run: `npm audit --audit-level=high` 0 vulnerabilities, `tsc --noEmit` 0, lint 0, **1037/1037 tests** (+2), `next build` and `check:shells` clean. A local `docker buildx build --no-cache` with a throwaway test key built; the image's `server-reference-manifest.json` key matched the test key (compared, never printed), and the key appeared 0 times in `docker history` and in the image `Env`.

**Follow-ups.**
- **The GitHub secret was NOT set when this branch was first pushed** (`gh secret list` showed only the two GitLab names). So this branch's first build ran keyless, and the registry build cache now holds a keyless `npm run build` layer for this tree. A merge commit with the same tree would reuse it. Operator, in this order: (1) set the GitHub Actions secret and the runtime env value, with the same value; (2) push one more commit to this branch that touches the Docker context (any `docs/` edit does) and check that its `build-scan-and-push` log has no "… is not a valid secret" warning; (3) only then merge; (4) after the deploy, run the match check in `DOCKER.md`.
- Family-wide: the cache caveat applies equally to event-manager and mp-senior-care if they ever rotate the key.
