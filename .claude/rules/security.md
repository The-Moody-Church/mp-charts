# Security Best Practices

This project handles **PII** (names, emails, phones, dates of birth, background check data). All code must follow these security practices. These rules apply during development — catch issues at write time, not in review.

## Ministry Platform Data Safety — MANDATORY

**NEVER delete, update, or create records in Ministry Platform without explicit user confirmation first.** No exceptions — not agents, scripts, "cleanup" operations, or "it's just one record."

Ministry Platform is a shared production database containing real church member data — contacts, communications, subscriptions, donations, groups, events. Unauthorized writes can affect thousands of people.

**Before ANY write operation** (`deleteTableRecords`, `updateTableRecords`, `createTableRecords`, stored procedures that mutate state, or any HTTP `POST`/`PUT`/`DELETE` to the MP API):

1. **Stop.** Do not execute the operation.
2. **Show the user** exactly what will be affected: the table name, the record IDs, the fields that will change, and the old → new values where applicable.
3. **Wait for the user to explicitly say yes** before proceeding.
4. If the user says no, do not retry or suggest alternatives unless asked.

**Read-only operations are always fine** — `getTableRecords`, `GET` requests. Only writes require confirmation.

This rule applies to all agents, subagents, scripts, hooks, and scheduled tasks. **There are zero exceptions.**

## Filter & Query Safety

Ministry Platform's REST API accepts OData-style `$filter` parameters that map to SQL WHERE clauses. **Never interpolate raw strings into filters.**

```typescript
import { sanitizeLikeValue, sanitizeFilterValue, sanitizeId, sanitizeIds, sanitizeGuid } from "@/lib/providers/ministry-platform/utils/filter-sanitize";

// LIKE clauses — escapes quotes AND neutralizes wildcards (% _ [) via character
// classes ([%], [_], [[]), so user input matches literally. No ESCAPE clause needed.
const safe = sanitizeLikeValue(userInput);
filter: `Last_Name LIKE '%${safe}%'`

// Non-LIKE quoted strings — escape single quotes
const value = sanitizeFilterValue(userInput);
filter: `Membership_Status = '${value}'`

// Single numeric IDs — validates a positive integer, throws otherwise.
// React Flight args are type-erased: a "number" parameter can arrive as the
// string "1 OR 1=1", which passes truthiness checks like `!id || id <= 0`.
const safeId = sanitizeId(contactId);
filter: `Contact_ID = ${safeId}`

// IN clauses — validate all IDs are finite positive numbers
filter: `Contact_ID IN (${sanitizeIds(ids)})`

// GUID values — validate format before interpolation
const validGuid = sanitizeGuid(guid);
filter: `Contact_GUID = '${validGuid}'`
```

**Anti-patterns — NEVER do these:**
```typescript
filter: `Last_Name LIKE '%${search}%'`          // breaks on O'Brien, injectable
filter: `Last_Name LIKE '%${sanitizeFilterValue(s)}%'` // quotes safe, but % and _ still act as wildcards
filter: `Contact_ID = ${id}`                     // type-erased: "1 OR 1=1" interpolates verbatim
filter: `Contact_ID IN (${ids.join(',')})`       // no numeric validation
filter: `User_GUID = '${profile.sub}'`           // no format validation
```

**Non-strings are refused** (batch 4, upstream a11c2a3 adapted): `sanitizeFilterValue`, `sanitizeLikeValue` and `sanitizeGuid` throw a fixed message (`Invalid filter value` / `Invalid GUID format`) for anything that is not a string. A type-erased Flight argument can be an array, and `sanitizeGuid(['<guid>'])` used to pass (RegExp coerces the array) and return the array.

**Rule**: Every string interpolated into a `filter:` parameter MUST pass through a sanitization function from `filter-sanitize.ts`. This applies to:
- User search input in LIKE clauses -> `sanitizeLikeValue()`
- User input in other quoted-string comparisons -> `sanitizeFilterValue()`
- Single numeric IDs (even typed as `number`) -> `sanitizeId()` — validate at the **action boundary** (reassign: `id = sanitizeId(id)`), not just in the service; it also enforces the safe-integer bound, so an unsafe-integer string can't silently coerce to the wrong record ID
- Arrays of IDs (even from DB results) -> `sanitizeIds()` or `sanitizeIdsOptional()`
- GUIDs (even from trusted sources like OIDC) -> `sanitizeGuid()`

### CI Enforcement

The CI workflow includes a `security-lint` job that greps for `.join(` near `filter` patterns in TypeScript source files. This catches the most common anti-pattern (using `.join(",")` instead of `sanitizeIds()` in filter `IN (...)` clauses). The check runs on every push and PR to `main`.

If you need `.join()` in a non-filter context and it triggers a false positive, add a `// filter-safety-ignore` comment on the same line.

### CI Job Layout

`.github/workflows/docker-build-push.yml` has three jobs, split by whether they need repository secrets:

| Job | Secrets? | Runs for Dependabot? | What it does |
|-----|----------|----------------------|--------------|
| `security-lint` | no | yes | the `.join()` filter grep above |
| `verify` | no | **yes** | `npm ci`, the npm audit gate (`node scripts/audit-gate.mjs`, below), `npm run lint`, `npm run test:run`, `npm run build`, local Docker build (`push: false`), Trivy scan |
| `build-scan-and-push` | **yes** | no (`if: github.actor != 'dependabot[bot]'`) | registry login, build + push `:${sha}`, Trivy, retag `:dev` / `:latest` / `:main` |

**Keep verification steps in `verify`, not in `build-scan-and-push`.** Dependabot PRs cannot access
Actions secrets, so the registry job is gated on the actor — and before `verify` existed, that gate
skipped `npm audit`, the build and the image scan for every bot PR (they merged on `security-lint`
alone, in ~10s). Anything that does not need the registry belongs in `verify` so it covers all actors.

**Both build steps set `no-cache-filters: runner`.** The runner stage's `apk upgrade` only patches
Alpine CVEs if its layer actually rebuilds; a cached layer pins old packages and fails the Trivy gate
as soon as a new OS CVE lands (CVE-2026-14456, 2026-09-01). The two jobs use different caches
(`verify`: GHA, evicted after ~7 idle days; `build-scan-and-push`: registry `buildcache`, never
expires), so without the filter they can even disagree — verify green, push job red. Keep the filter
on **both** steps.

**The npm audit gate is a hard deploy gate.** It runs before any image is built, so an unresolved
HIGH advisory blocks *all* deploys, not just dependency PRs. This has bitten twice (2026-07-10 after
#190, and a 27-day production freeze discovered 2026-08-06). Run `node scripts/audit-gate.mjs`
locally before pushing. The nightly `audit-nightly.yml` runs the same gate against unchanged code.

### npm audit gate and its allow-list

`scripts/audit-gate.mjs` replaced `npm audit --audit-level=high` in the `verify` job's "Audit npm
dependencies" step and in `audit-nightly.yml` on 2026-10-07. The rule is the old one — **any HIGH or
CRITICAL vulnerability fails** — with one narrow way out: an advisory listed in
`scripts/audit-allowlist.json`. The decision logic is `scripts/audit-gate-lib.mjs`, tested by
`scripts/audit-gate-lib.test.ts` (part of `npm run test:run`). Those three files are meant to be
byte-identical in mp-charts, event-manager, mp-senior-care and music-tools (since music-tools #187): change them in all four, and `diff`
them after.

How it decides, failing closed at every step:

- Only `high`/`critical` are gated (moderate and below are ignored, as before). An unrecognised
  severity is a violation.
- Each vulnerability is resolved to its **root advisories** by walking npm's `via` chain (`micromatch`
  → `braces` → the advisory). It passes only when it resolves to at least one advisory, nothing on the
  way is unresolvable, and **every** root advisory is on the allow-list with a matching GHSA id
  **and** package. A dependency whose roots include the allow-listed advisory plus any other
  advisory, at any severity, fails.
- **An entry is a dev-only exception, and the gate enforces that.** Whenever an entry is in use (the
  first audit passed with at least one allow-listed finding), the gate runs a second audit of the
  production tree, `npm audit --json --offline=false --omit=dev --include=optional --include=peer`.
  If an allow-listed advisory appears there at any severity, the gate fails
  (exit 1): `allow-listed GHSA-… (pkg) now reaches a production dependency; the dev-only exception
  no longer holds`. This check matches the GHSA id alone, under any package name or none, so an
  advisory the production audit files under another package still counts. Nothing else would catch it: Trivy runs with `ignore-unfixed`, and an advisory
  that needs an entry has no fix. (Measured: `npm install micromatch@4.0.8 --save` made braces a
  production dependency, and the gate without this check still exited 0.) That second audit goes
  through the same retry and fails closed the same way. The one exception is an entry carrying
  `production_via_optional_peer` (below), which is proven from the lockfile instead.
- The audit endpoint failing (`audit endpoint returned an error`) is retried, 3 attempts 30 s apart,
  then the step **fails** (exit 2). Output that is not a valid report, or an invalid allow-list, also
  fails (exit 2). Violations exit 1. It never passes on an error. npm's error text is echoed with
  any `user:token@` in a URL masked.
- npm runs as `npm audit --json --offline=false --include=dev --include=optional --include=peer`.
  The extra flags are deliberate: with `offline=true` in an `.npmrc` (or `npm_config_offline`) npm
  prints a *clean* report and exits 0, and `omit=dev` would drop the devDependency tree.
- Output: each allowed finding is a `::notice::` with the entry's reason; an entry past its
  `review_by` date, or whose advisory no longer appears in the audit at all, is a `::warning::` (it
  does not fail); each violation is an `::error::` with the package, severity and advisory URLs;
  the production-tree check ends with one line saying no allow-listed advisory reaches it, or an
  `::error::` per entry that does. A proven `production_via_optional_peer` entry is a `::notice::`
  with the path it was proven on, and the last line then says how many were proven.

#### Optional-peer production exception (`production_via_optional_peer`)

**Why it exists.** GHSA-fc5q-39xc-vjpf (picomatch `<=4.0.7`, HIGH, no patched release) reached
`npm audit` on 2026-11-17 and failed the gate in all four repos. picomatch is dev tooling only
(vitest, vite, tinyglobby/fdir, the eslint chain), and the standalone image has no npm picomatch. A
plain entry could not pass, because the production check above still found it: better-auth 1.7
declares **vitest as an optional peer** (`peerDependenciesMeta.vitest.optional`, used only by
its `better-auth/test` export, `dist/test-utils`). vitest is also a devDependency, so npm marks it `devOptional`, and
`--omit=dev` keeps it with its whole subtree. `--omit=peer` leaves it there too, and
`--omit=optional` would also hide shipped optional packages such as sharp's platform binaries.

**What it says.** An entry may carry `"production_via_optional_peer": [{ "from": "better-auth",
"peer": "vitest" }]`: 1 to 4 exact **(from, peer) edges**, never package names on their own. It
means "this advisory may appear in `npm audit --omit=dev` only through the optional-peer edge(s)
named here". `from`/`peer` must be plain lowercase npm names (no paths, `..`, `node_modules`,
whitespace or wildcards), `from` may not be the advisory's own package, and an entry carrying the
field must have `review_by` **at most 45 days** after `added`. An entry without the field behaves
exactly as before. A test pins which entry may carry the field and with which edge, so widening it
needs a reviewed test change too.

**How the gate proves it.** Only when the production audit lists an entry carrying the field, the
gate reads `package-lock.json` and `package.json`. `audit-gate.mjs` serves `readProjectFile` those
two names and nothing else. Then:

1. The lockfile must be `lockfileVersion` 3, with no legacy `dependencies`, no workspaces or links,
   only `node_modules/...` keys, and a root identical to `package.json` (dependencies, dev,
   optional, peer and peer meta).
2. **Model check.** The gate reaches the production graph from the root over `dependencies`,
   `optionalDependencies` and `peerDependencies`, never devDependencies. It resolves each edge the
   way npm's Arborist does (`Node.resolve`: own `node_modules` child first, then each ancestor's),
   and loads edge types in Arborist's `loadDeps` order. The set it reaches must equal npm's own
   non-`dev` nodes in the lockfile (`calcDepFlags`), in both directions, or the gate stops.
3. Every node `npm audit --omit=dev` reports for the package must be a real, non-dev lockfile node
   of it, and the advisory may not appear under any other package name.
4. Every production copy of `from` must be the real package (not an alias or bundled), declare
   `peer` in `peerDependencies` with `peerDependenciesMeta[peer].optional === true` (the boolean),
   and not also list it as a dependency. The edge must resolve to a production node.
5. **The proof.** With exactly those (from, peer) `peerOptional` edges removed, `from` must still be
   reachable, and **no node of the package, of any version and by installed or real name**, may be
   reachable. Any one that is reachable is reported with a shortest witness path, such as
   `root -dep-> node_modules/micromatch -dep-> node_modules/picomatch`.

Exit 2 (could not verify): a project file that cannot be read or parsed, a lockfile that fails
step 1, a model disagreement, an unresolved required edge, or a report that does not bind to the
lockfile (step 3; locally, a stale `node_modules` lands here). Exit 1 (violation): a broken premise
(step 4) or any witness path (step 5). A plain entry that is exposed, or an exposed proof, beats an
unprovable one, so the gate exits 1. The full-tree rules are unchanged: a mixed root still fails.

**What it does not cover, and the build check that does.** The proof is about the dependency graph, not
the image. Next's standalone trace copies, and Turbopack bundles, whatever runtime code loads, so an app
import of `vitest`, `better-auth/test`, `tinyglobby`, `vite`, `fdir` or `picomatch`, or an
`outputFileTracingIncludes` glob, would put picomatch in the image while the gate passed (a 2026-11-17
review built exactly that: `createRequire(...)("picomatch")`, `@/../node_modules/picomatch/index.js` and a
route importing a `__mocks__` file all bundled picomatch into a server chunk). Two repo-local checks close it:

- **`scripts/check-standalone.mjs`, the one that decides** (`npm run check:standalone`; rule and tests in
  `scripts/standalone-check-lib.mjs` / `.test.ts`). It runs on the build output, after `npm run build`, in
  the `verify` job and again in the Dockerfile's builder stage, so the build the runner copies is the one
  checked. Every npm file the server build ships must belong to a lockfile node reachable over production
  edges **with every optional-peer edge removed**: each file copied into `.next/standalone/node_modules`,
  each node_modules file in a `.next/**/*.nft.json` trace, and each module Turbopack bundled into a
  shipped `.next/server` chunk, read from the chunk's source map. Exit 1 names the node and where it was
  seen; exit 2 (could not verify) for a missing standalone dir, a server chunk without a source map (Next
  writes them by default; turning them off fails this step), a map source it cannot place, or a lockfile
  out of sync. Two notices, not failures: a lone `package.json` of an unshipped node (Next's trace records
  `node_modules/semver/package.json` while resolving sharp's own semver: metadata, no code), and bundled
  source names that a package's own source map invented (lucide-react's maps name `../shared/src`), which
  fail only if they name a package outside the shipped graph. Client chunks (`.next/static`) run in the
  browser, have no maps in production, and are not checked.
- **`src/test-only-imports.test.ts`, the early warning** at `npm run test:run` time. Every module reference
  in runtime code (src/** outside tests, plus the root runtime files `cache-handler.js` and
  `next.config.ts`; any new root-level source file must be classified) must be a Node builtin, a
  package.json `dependencies` entry (or a listed transitive exception, today only `@better-auth/core`) that
  resolves to a lockfile node reachable without any optional-peer edge, or a relative/`@/` path that
  **resolves** to a file inside src/ that is not a test, mock (`__mocks__`/`__tests__`) or test-setup file.
  References are import/export, `import()`, `require()`, `require.resolve()`, `module.require()`,
  `import.meta.resolve()` and `@jsxImportSource` pragmas, each with a literal; `createRequire` and
  `require`/`module.require` passed around as a value are refused outright. `better-auth/test` is refused
  by name, and so is **every picomatch or micromatch specifier**, Next's vendored one included. It also
  pins the options `next.config.ts` sets (a new one, such as `outputFileTracingIncludes`,
  `serverExternalPackages`, `turbopack`, `webpack` or `images`, fails until reviewed and listed).

**Next itself vendors picomatch 4** (`next/dist/compiled/picomatch`, used by
`images.remotePatterns`/`localPatterns` matching). It ships in the image as part of `next`, and neither
npm audit nor the build check can see it. The ReDoS needs an extglob in one of those patterns, which come
from `next.config.ts`; `src/test-only-imports.test.ts` fails if a pattern contains one (`@(`, `!(`, `?(`,
`*(`, `+(`), and runtime code may not import that copy. Keep it that way: GitHub withdrew the advisory on 2026-11-18, but the guard costs nothing.
Since 2026-11-18 (N14) `images: { unoptimized: true }` also makes `/_next/image` answer 404 before any
pattern is matched, so no runtime request reaches the vendored copy at all; it still ships inside `next`.

**Adding a new edge** needs the same PR evidence as an entry, plus the dependency path through the
edge and the lockfile's `peerDependenciesMeta` for `from`. Use it only for an optional peer that the
app never loads. It never excuses an advisory that has a fix: the 2026-11-17 minimatch co-root
(GHSA-g3hv-75wg-m249 on `@typescript-eslint/typescript-estree`) was fixed by bumping typescript-eslint
to 8.73, not allow-listed. Without that bump the gate still fails on the mixed root.

**Current entries: none** (since 2026-11-18). The picomatch entry, GHSA-fc5q-39xc-vjpf (HIGH, added 2026-11-17,
the only one ever to carry `production_via_optional_peer`), was removed when GitHub **withdrew** the advisory
on 2026-11-18 and the gate began warning that it no longer appeared in `npm audit`. The picomatch/micromatch
import refusal and the extglob image-pattern check in `src/test-only-imports.test.ts` stay as cheap guards.

The first entry was GHSA-vfj7-8cjw-p6xm (braces, HIGH), added 2026-10-07 for a lint-toolchain-only path (`eslint-config-next` → `@next/eslint-plugin-next` → `fast-glob` →
`micromatch` → `braces`) with no patched release. GitHub **withdrew** the advisory by 2026-10-24. The gate then
warned that the entry no longer appeared in `npm audit`, as designed, and it was removed.

**Adding an entry** — only for an advisory with no fix you can take, on a path that does not reach the
production image. Prefer a fix every time: a patched release, a lockfile update within range, or an
`overrides` entry. The advisory must be absent from `npm audit --omit=dev`; if it is not, the gate
fails however the entry is written, and that is deliberate: shipping a known-vulnerable package is a
bigger decision than a JSON line. The only exception is an advisory that reaches `--omit=dev` solely
through an optional peer, proven by `production_via_optional_peer` (above). An entry is:

```json
{ "id": "GHSA-xxxx-xxxx-xxxx", "package": "<the package the advisory is filed against>",
  "reason": "<why it is safe to ship: the path, why no fix, why not in the image>",
  "added": "YYYY-MM-DD", "review_by": "YYYY-MM-DD",
  "production_via_optional_peer": [{ "from": "<npm name>", "peer": "<npm name>" }] }
```

The last field is optional; leave it out unless the production check needs it.

`review_by` must be after `added`; keep it about a month out. The gate refuses the whole file (exit 2)
if any field is missing or malformed, an id repeats, or an unknown field appears. Put the evidence in
the PR: the advisory, the dependency path, and proof the package is not in the image.

**Reviewing and removing.** When the nightly run warns that an entry passed `review_by`, check for a
patched release (or a Next release whose `@next/eslint-plugin-next` no longer pins the vulnerable
chain). If one exists, take it and delete the entry; if not, re-confirm the reasoning and move
`review_by` forward in a PR that says so. When the run warns an entry *no longer appears in npm
audit*, the dependency was fixed or removed — delete the entry. An empty list (`[]`) is valid. If
the gate fails with *now reaches a production dependency*, or *reaches a production dependency outside
its declared optional peer edge(s)*, find the new production path (the witness, or
`npm ls <package> --omit=dev`) and remove it; do not widen the exception. When the run warns that an
entry's advisory *no longer appears in npm audit --omit=dev*, remove `production_via_optional_peer`
from it (the entry is then an ordinary dev-only one). The gate only warns there, but the unit test
`this repository's package-lock.json > <id> is in production only through its declared optional-peer
edges` (part of `npm run test:run`, so it blocks `verify`) **fails** as soon as no node of the
entry's package is in the lockfile's production tree, with the message `remove
production_via_optional_peer from this entry`. That is deliberate: the field is removed in the same
PR that makes it unused (for example a better-auth release that drops its vitest peer, which a
Dependabot PR would otherwise merge with the field left behind).

Do **not** add `continue-on-error`, `|| true` or a raw `npm audit` call back to either workflow; the
"CI wiring" tests in `scripts/audit-gate-lib.test.ts` fail if you do.

## MP Client Guards (provider layer) — batch 3, 2026-11-19

The MP client runs as an admin-level service account, so the provider layer
(`src/lib/providers/ministry-platform/`) checks every value it puts in a request path itself, whatever the caller
did. Types are erased at runtime. Each check runs **before `ensureValidToken()`** (no token or network work for a
doomed call) and throws a **fixed message that never echoes the value**. Upstream MPNext 9b7b4d1, 41bba94, 3d9ae92,
5aa0b5e, adapted (audit N12, N21).

- **`sanitizeIdentifier(value, field)`** (`services/guards.ts`): `/^[A-Za-z_][A-Za-z0-9_]*$/`, at most 128
  characters, strings only; throws `Invalid <field>`. Every table name (`table.service.ts`, `file.service.ts`) and
  procedure name goes through it. All 278 MP tables in `ministryplatform.schema.md` and every live caller's table name
  pass (checked 2026-11-19). `encodeURIComponent` alone is not enough: it leaves `..` intact.
- **File segments**: table via `sanitizeIdentifier`, record/file IDs via `sanitizeId`, unique IDs via `sanitizeGuid`,
  then `encodeURIComponent`. Delete IDs (`deleteTableRecords`) go through `sanitizeId` one by one; one bad ID refuses
  the whole call.
- **Stored procedures are deny-all.** `ALLOWED_PROCEDURES` (`services/procedure.service.ts`) is empty: mp-charts
  calls none. To enable one, pass a fixed, module-level list next to its caller,
  `new MPHelper({ allowedProcedures: ['api_X'] })`, or add it to `ALLOWED_PROCEDURES` in the same change as the
  caller. Never build the list from request input. Matching is exact and case-sensitive; one helper's list never
  widens another's. `getProcedures` (metadata) is not gated.
- **`HttpClient.assertSafeEndpoint`**, first in `buildUrl`: the endpoint must start with `/` and contain no `..`,
  `?`, `#`, `\`, `%2e`, `%2f`, `%5c` or control character, and must resolve under the base URL. It is the net under
  every caller, not a replacement for the guards above.
- **Redirects are refused** (`redirect: 'error'`) on every MP fetch: the six `HttpClient` methods, the
  client-credentials token POST (a 307/308 would re-send `client_secret`), `getFileContentByUniqueId` and the userinfo
  call. A refused redirect is a `TypeError` the caller logs and rethrows.
- **Timeouts** live in `utils/timeouts.ts`: API 30 s, upload 60 s, token 10 s (userinfo's 10 s is in `auth.ts`).
- **The token response is validated**: a header-safe `access_token` is required (visible ASCII `0x21-0x7E` only: a
  NUL or CR/LF would make undici's invalid-header error quote the whole `Bearer <token>`); `token_type` may be absent, and
  if present must be `bearer` in any case. Errors carry only a status or an error class name, never the body, the
  secret or the token. The refresh is single-flight and `expires_in` is clamped to [30 s, 3600 s].
- **No `$ignorePermissions`** (N21): removed from `GlobalFilterParams`; `DomainService` forwards only a `sanitizeId`'d
  `$userId`. Do not add it back.
- **Logging**: provider services log a fixed message plus `errorForLog(error)`, never a table, procedure or ID in
  the message and never the raw Error. `HttpClient` error messages redact file GUIDs to `{uniqueId}`.
  `services/log-sites.test.ts` pins every log line in `services/` and `client.ts` to
  `console.error('<fixed text>', errorForLog(error));` and each service catch to log-then-rethrow.
- **Empty bodies**: `readJson` returns `undefined` for a 204 or any empty/whitespace body (an empty chunked 200 has
  no Content-Length); a body-read failure propagates unchanged, only a JSON parse failure becomes the fixed message.

## File Upload Validation

All file upload endpoints must validate MIME type **and** file size on the server side. Limits match Ministry Platform: **20 MB max**, standard file formats (PNG, JPG, BMP, GIF, PDF, TXT, CSV):

```typescript
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/webp'];
const ALLOWED_DOCUMENT_TYPES = [...ALLOWED_IMAGE_TYPES, 'application/pdf', 'text/plain', 'text/csv'];

// Validate before processing
if (!ALLOWED_DOCUMENT_TYPES.includes(file.type)) {
  return { success: false, error: `Invalid file type: ${file.type}` };
}
```

## URL & Redirect Safety

Never use user-supplied URLs for redirects without validation:

Do **not** validate with string-prefix checks like `startsWith("//")` / `includes("://")` — they miss the backslash bypass: browsers normalize `\` to `/`, so `"/\evil.com"` passes those checks yet navigates off-site. Resolve against your own origin and require it to stay same-origin — and then check the **output** too, because dot segments are removed while parsing: `"/.//evil.com"` resolves on our origin to the pathname `"//evil.com"`, which is protocol-relative when navigated to. The live copy is `src/components/sign-in/sign-in.tsx`, tested by `safe-callback-url.test.ts` beside it:

```typescript
// Validate callback URLs are same-origin (client component — uses window.location)
function getSafeCallbackUrl(url: string | null): string {
  if (!url) return "/";
  // Reject backslashes and control chars first (browsers normalize "\" to "/").
  if (/[\\\x00-\x1f]/.test(url)) return "/";
  try {
    const resolved = new URL(url, window.location.origin);
    if (resolved.origin !== window.location.origin) return "/";
    const safe = resolved.pathname + resolved.search + resolved.hash;
    // Dot segments are removed while parsing: "/.//evil.com" resolves on OUR
    // origin to the pathname "//evil.com", which is protocol-relative when
    // navigated to. Check the output, not just the input.
    if (safe.startsWith("//")) return "/";
    // Not a security check: better-auth stores the callback in the oauth_state
    // cookie (~2 bytes a character), which the browser drops past ~1754
    // characters. Below that, and below the 2048 server cap, sign in to home.
    return safe.length > MAX_SIGN_IN_CALLBACK_URL_LENGTH ? "/" : safe; // 1536
  } catch {
    return "/";
  }
}
```

## Logging & PII

**Never log PII in production.** This includes contact records, emails, phone numbers, notes, and any data from Ministry Platform tables that contain personal information.

```typescript
// Log operation context, not data
console.error("Error updating contact:", error);

// Gate verbose logging behind NODE_ENV
if (process.env.NODE_ENV === 'development') {
  console.log("Debug:", data);
}

// NEVER log PII
console.log("Contact:", JSON.stringify(record));         // leaks email, phone
console.log("HTTP PUT:", JSON.stringify(body, null, 2)); // leaks request payloads
```

**Log caught errors with `errorForLog(error)`** (`src/lib/log-safe.ts`), not the raw Error, wherever the error
can carry caller-shaped text (CodeQL `js/log-injection`). It returns one `name: message` line with control
characters stripped, plus ` (cause: <name> <code>)` when the error has an object `cause` (`causeForLog`): undici's
`TypeError: fetch failed` keeps ECONNREFUSED, `UND_ERR_CONNECT_TIMEOUT` or a refused redirect only there. Name and code
are each kept only if they match `^[A-Za-z0-9_]{1,64}$`; the cause's message is never copied (undici's
"unexpected redirect" becomes the fixed label `redirect refused`). Keep its first `.replace(/\n|\r/g, "")` verbatim: that is the form CodeQL recognises.
Error messages the app throws must be static, never echoing a slug, type or other argument. That includes
`mp-datetime.ts` (`toMpSqlDatetime: cannot parse value`, `parseMpDatetime: expected an MP wall-clock string`;
static since batch 4, upstream defd338 adapted), whose tests assert the message does not contain the input.

## Better Auth Endpoint Exposure — MANDATORY

The better-auth catch-all route mounts far more HTTP endpoints than this app uses. Two controls keep that surface closed, and **both must stay**:

1. **`allowedAuthRoutes` in `src/app/api/auth/[...all]/route.ts`** — a deny-by-default allowlist. Only the exact paths our browser client calls reach better-auth; everything else returns a plain 404 without touching it. Exact string match only: no regex, no prefix matching.
2. **`disabledAuthPaths` in `src/lib/auth.ts`** — passed as `disabledPaths`, matched in better-auth's router before rate limiting, plugins and `sessionMiddleware`.

**Adding a browser-side better-auth call means adding its path to the allowlist first** — the 404 is designed to make that omission loud. Never widen either list to make an unrelated failure go away.

The one POST the allowlist admits, `/sign-in/social`, is body-filtered in `route.ts` before better-auth (and before its rate limiter) sees it: exactly `provider` + `callbackURL` (`allowedSignInSocialKeys`), exactly `application/json` (an anchored match — `trim()` would also strip U+00A0 and let a value past that better-auth then parses differently), at most 4096 bytes, and a `callbackURL` string of at most 2048 characters (`MAX_CALLBACK_URL_LENGTH`). Every refusal is the same 404, and every response from the route, 404s included, carries `Cache-Control: no-store` (`withNoStore`, upstream 721d6e5: a Cloudflare cache rule changed later must not be able to replay one user's callback `Set-Cookie` to another). The sign-in page itself sends less: `getSafeCallbackUrl` sends `/` above `MAX_SIGN_IN_CALLBACK_URL_LENGTH` (1536), because the 2048 cap does not fit in a cookie — better-auth's `oauth_state` value is 556 + 2 × length bytes (better-auth 1.7.5, re-measured unchanged on 1.7.14 and 1.7.18), and past 1754 characters, with the production `__Secure-better-auth.oauth_state` name, it exceeds the browser's 4096-byte limit, is silently dropped, and the MP callback ends on `/auth-error?error=state_mismatch`. `route.test.ts` measures the real cookie at both limits. The cap is also the first read of the body: **`src/proxy.ts` does not match `/api/auth`** (since 2026-11-09). On a matched path Next copies the body, up to its 10 MB `proxyClientMaxBodySize`, and waits for the whole body to end before anything answers, even when the proxy has already returned. Before this change that applied to every anonymous auth request, ahead of the filter and the rate limiter. A measured 9 MB body now gets its 404 in under 40 ms. The proxy did nothing on `/api` anyway (a public early return, and a CSP nonce is meaningless on JSON and redirects); `src/proxy.test.ts` pins the exclusion against the real `config` through Next's own matcher. **Do not add `/api/auth` back to the matcher.** **Server Action requests skip the proxy too** (a `missing` `next-action` header condition, since 2026-11-09, #252): matched, an action got only the proxy's 10 MB copy, so every upload over 10 MB failed with "Unexpected end of form" despite the 20 MB limits; unmatched, it reads up to `serverActions.bodySizeLimit` (20 MB). Every action calls `requireSession()` itself, so the proxy's presence-only cookie check guarded nothing there. Page paths still get the 10 MB copy, accepted 2026-11-18 (#297): skipping the proxy for bodied requests only moves the cost to Next's no-JS form-action decode (up to 20 MB, measured), and the 20 MB action path accepted under #252 is the larger exposure anyway.

Why this matters concretely: `POST /update-user` takes a body of `z.record(z.string(), z.any())` and copies any additional field declared `input !== false` straight onto the session, with no validator. Our `userGuid`/`mpUserId`/`mpContactId` must stay `input: true` for sign-in to work, so before this was closed any authenticated user could POST themselves another user's MP identity and inherit their User Groups and audit attribution (GHSA-pqxp-c5mr-5398). `input: false` is not an alternative — the same flag governs whether the OAuth profile may populate the field, so setting it breaks sign-in.

**If either control is ever removed, rotate `BETTER_AUTH_SECRET`.** Closing the endpoint does not revoke a session already forged, and with no database there is no session table to clear. Rotating the secret invalidates every signed cookie at once.

> **Erratum (2026-09-29) on GHSA-pqxp-c5mr-5398.** This section used to say a forged session lived "in the JWT cookie cache for up to an hour". That was wrong for the configuration in force until 2026-09-29: better-auth silently turned `cookieCache.refreshCache` on (stateless default) and slid `expiresAt` daily, so a forged or copied cookie pair re-minted itself and could persist **up to the session's `expiresAt` — 7 days, self-renewing** — and a copied `session_token` alone lasted until the container restarted. The 2026-09-29 session settings (below) end every session that existed before that deploy within 1h of it: the restart empties the in-memory store, and `refreshCache: false` stops a cookie from re-minting itself once its one-hour cache lapses.

## Better Auth Sessions — MANDATORY

There is no database: the signed `session_token` + `session_data` cookies are the session, backed by an in-memory store that sign-out can delete from but that cannot recall a copied cookie. These settings in `src/lib/auth.ts` put a hard ceiling on any session's life. **Do not remove or "tidy" any of them** — each is pinned by `src/lib/auth.session-lifetime.test.ts` or `src/lib/auth.shared-instance.test.ts`.

| Setting | Why |
|---|---|
| `auth = sharedInstance(Symbol.for("tmc.auth"), createAuth)` | Next loads `auth.ts` once per bundle layer. With a `betterAuth()` per copy, the OAuth callback stored the session in the route handler's store and sign-out deleted it from the server action's, empty one. One instance per process fixes sign-out and lets server components/actions see the session after the cookie cache lapses |
| `session.expiresIn: 12h` | `expiresAt` is fixed at sign-in; nothing outlives it. better-auth's default is 7 days. Matches the id-token store's 12h TTL |
| `session.disableSessionRefresh: true` | Otherwise the store slides `expiresAt` forward once a day |
| `cookieCache: { maxAge: 1h, strategy: "jwt", refreshCache: false }` | `refreshCache: false` **must be explicit** — with no database better-auth merges `true` under our config, which re-signs `session_data` from the cookie alone. With `false`, a cookie with no live row behind it dies within 1h |

What users see: they go back through sign-in at least every 12h, and within 1h of every deploy or restart (a silent redirect while their MP session is alive).

**Auth option edits need a `next dev` restart.** Hot reload re-evaluates `auth.ts` but `sharedInstance` returns the instance already on `globalThis`.

**Emergency "sign everyone out"**: rotate `BETTER_AUTH_SECRET` (or add `cookieCache.version` and bump it).

**The user's MP OAuth tokens are not retained.** `account.storeAccountCookie: false` keeps them out of the browser (better-auth defaults it on without a database), and `databaseHooks.account` strips the access/refresh tokens and expiries before the in-memory row is written. The idToken is kept for sign-out's `id_token_hint` fallback. Nothing in this app acts as the user against MP after sign-in; if something ever needs to, add it deliberately.

## Identity & Email

**Never use `session.user.email` for display, lookup or mail.** It is a synthetic `<sub>@mp.invalid` value derived from the MP `User_GUID`. The real Ministry Platform address is on `session.user.mpEmail`, which is **nullable** — MP does not require an email.

This exists because better-auth's `email` column is required and unique, and its OAuth callback uses `findUserByEmail` as a fallback identity lookup, while **Ministry Platform enforces no uniqueness on email at all**. Households routinely share one address across contacts who each hold a `dp_Users` login. Keying on email meant the second person to sign in inherited the first person's identity.

## Attribution is Server-Authoritative

Any value that decides **who did this** or **whose record this is** comes from the server, never from a caller-shaped payload.

For contact logs (`src/services/contactLogService.ts`):

| Field | Create | Update |
|---|---|---|
| `Made_By` | the service's `madeBy` argument, from the session | **never sent** — MP preserves the original author |
| `Contact_ID` | caller's subject contact, `sanitizeId`'d | **never sent** — a log cannot be re-parented |
| `Planned_Contact_ID`, `Contact_Successful`, `Original_Contact_Log_Entry`, `Feedback_Entry_ID` | **never sent** — no UI sets them | **never sent** |

The runtime control is the Zod **`.pick()` allowlist** in the service (since batch 4, 2026-11-19, upstream dc4a25b adapted; it was an `.omit()` blocklist before): create parses with `ContactLogSchema.pick({ Contact_ID, Contact_Date, Contact_Log_Type_ID, Notes })`, update with `.pick({ Contact_Date, Contact_Log_Type_ID, Notes }).partial()`. A `z.object` parse *strips* keys the schema does not declare, so a smuggled key is dropped rather than merely untyped, and with a pick a column added to `ContactLogSchema` later stays unwritable until someone adds it on purpose. The create record is then built field by field (no spread) as defense in depth. A narrow TypeScript parameter type guards nothing — types are erased at runtime and a server action is a POST endpoint whose payload shape the caller controls. `contactLogService.test.ts` pins the exact create payload key set, the key sets of both picks themselves (`ContactLogCreateSchema`/`ContactLogUpdateSchema` are exported for this: the create record literal limits the payload on its own, so a payload test cannot tell a pick from an `.omit()`), a create with wrongly-typed smuggled fields that must still succeed (a pick never sees them; an omit would validate and throw), and the smuggled-key cases (`Planned_Contact_ID`, `Feedback_Entry_ID`, `Original_Contact_Log_Entry`, `Contact_Successful` on create; `Contact_Successful`, `Contact_ID`, `Made_By` on update). `Contact_Log_Type_ID` is not checked against `Contact_Log_Types` (owner decision, 2026-11-19): a bad ID is an MP FK error, nothing more.

Two rules that follow:
- **Pass the acting user as a separate argument**, never as a field inside the data object. One source of attribution; two layers stamping it could drift.
- **Do not add `.passthrough()` or `z.looseObject`** to `ContactLogSchema` or to the picks, and do not regenerate it into that shape — the strip is the control, and the smuggled-key tests are what would catch it.

Every write (create and update) passes `{ $userId }` so MP's audit trail names the staff member rather than the API service account. **There is no contact-log delete at any layer**: the orphan `deleteContactLog` action went in batch 4 (N11) and the service method that backed it in the batch 4 follow-up (2026-11-19), since there is no delete UI. `contactLogService.test.ts` ("service surface") pins the service's method list, so a delete comes back only as a deliberate change; it would need the `Made_By` ownership check, the write tier and `$userId` again.

### Contact-log reads are minimised

`getContactLogsByContactId` (`src/components/contact-lookup-details/actions.ts`, search tier) returns `ContactLogDisplay` objects built field by field (upstream 710dfa8, adapted): `Contact_Log_ID`, `Contact_Date`, `Notes`, `Contact_Log_Type`, `Contact_Log_Type_ID`, `Made_By` (the owner-only Edit button needs it, which is why upstream's narrower set does not fit) and `MadeByContact`, which is `{ First_Name, Nickname, Last_Name }` only. Its `dp_Users` select is `User_ID` plus those three names. The MP row's link and flag columns, `Contact_ID`, and each staff author's email, mobile, Contact_ID and photo never reach the browser. **No spread of an MP row and no `as` cast in a DTO a browser receives**: a column added to the service's select would ride along unseen. `actions.test.ts` pins the exact key sets. The same goes for a write action's return value, which React Flight sends to the browser whether or not the client reads it: `createContactLog` and `updateContactLog` resolve to nothing rather than MP's POST/PUT response (the whole `Contact_Log` row). The general-tier duplicate of this read and a read of any log by ID (`contact-logs/actions.ts`, N11) were deleted in batch 4.

## Authentication & Authorization

- **The auth environment is checked when `src/lib/auth.ts` loads** (`assertAuthEnvironment`): a missing/empty `BETTER_AUTH_SECRET`, better-auth's public default secret, one shorter than 32 characters, any `BETTER_AUTH_SECRETS`, or a truthy `TEST` with `NODE_ENV=production` all throw, and the message never contains the value. "Truthy" is better-auth's own reading — anything but unset, empty or exactly `false`, so **`TEST=0` is refused too**; confirm a deploy target's `.env` has no such line before promoting a build. There is no `NEXTAUTH_SECRET` fallback. `next build` is exempt (`NEXT_PHASE=phase-production-build`). Next loads route modules lazily, so on a running server this shows as a **500 and a logged `[auth] …` reason on the first request that needs auth**, not a process exit — check the log, not just whether the container is up. `advanced.disableOriginCheck: false` is pinned so a stray `TEST` cannot switch off the Origin check
- **`BETTER_AUTH_URL` and `MINISTRY_PLATFORM_BASE_URL` are validated by the same load-time guard** (`src/lib/env.ts`, audit N19, 2026-11-18), with the same `next build` exemption and the same failure mode (500 plus `[env] …` in the log, process up). `BETTER_AUTH_URL`: required, no `NEXTAUTH_URL` or localhost fallback, an origin only, https except loopback http (allowed in production, since a loopback origin never leaves the machine). `MINISTRY_PLATFORM_BASE_URL`: https (loopback http only outside production), path kept. Both refuse credentials, query and fragment, and the message never contains the value. Read them only through `getAuthBaseUrl()` / `getMpBaseUrl()`, never `process.env.X!` or `|| "http://localhost:3000"`. The one deliberate exception is the CSP `form-action` source in `src/proxy.ts`, which reads the MP URL through `originOf`: the proxy runs on every page, so it fails soft (drops the source) instead of throwing. Before promoting a build, confirm both are https in the target `.env`
- Every server action MUST call `requireSession()` before any data access
- **Every export of a file-level `'use server'` module is a Server Action, so it must have a non-test importer.** `src/server-action-exports.test.ts` fails on any export nothing in the app imports (N11: three such contact-log actions sat unreviewed until batch 4). Test importers do not count, a named re-export inside a `'use server'` module needs its own importer, and `export *` there is refused; fixture self-checks pin each rule. Delete an unused action rather than keeping it "for later"; a file of helpers that should not be endpoints is not `'use server'` (`shared-actions/processing.ts`)
- Use `getMpUserId(session)` for audit attribution on write operations
- **A page that renders feature-specific data or config gates itself** with `await requireFeaturePageAccess(feature)` (`src/lib/authorization.ts`, N10, batch 5) in its async content component, **before** reading that config. Any failure (no session, no access, a rate limit, an MP error) redirects home, as `/admin` has since F11; `redirect()` sits outside the helper's try. Unknown, disabled and forbidden tool slugs all redirect alike (a feature key exists only while its tool is enabled), so the gate is not an existence oracle; a super-admin passes for any key, so keep `notFound()` after it. Used by `admin/layout.tsx`, `journey/[slug]`, `compliance/[slug]` and `summer-blast-volunteers`; `src/app/(web)/feature-page-gates.test.ts` pins the gate-before-read order. Pages that only call gated actions (dashboard, manage-members) need no page gate. `getUserAuthorization` sends the browser only the journey and compliance tools in the user's `accessibleFeatures`
- **The browser sees an ended session at its next visibility change, 5-minute poll or the session's own expiry** (a sign-out in this browser and the 12h cap; after a container restart, only once the 1h `session_data` cookie cache lapses, since `/get-session` answers from it with `refreshCache: false`) (SessionGuard, batch 6, upstream 02731d4 adapted). AuthWrapper checks the session once, on the server, so a tab left open after a sign-out elsewhere or the 12h cap used to keep showing member data. `src/components/layout/session-guard.tsx` wraps the `(web)` shell and acts only on a seen session turning into a settled null with no error (better-auth 1.7.18's shape for an ended session; pending, refetching, error, and an initial null never act). With nothing unsaved it `location.replace`s to `/signin?callbackUrl=…` and renders no page. **With unsaved edits it warns and waits** (owner's decision, 2026-11-20): the page and its data stay on screen, dimmed under an always-open Radix `AlertDialog` offering sign-in in a new tab, a re-check, or discard-and-sign-in. It is an AlertDialog so it works above an open modal Dialog (pointer events, focus) without dismissing it and losing the note; focus goes to its title, never a button. That keeps a half-written pastoral note at the cost of PII staying visible, **but only while there is something to protect**: the hold is re-checked every 2 s and on each refetch that settles null again, and leaves for `/signin` once nothing unsaved is left. **A live session for a different user** (by MP `userGuid`) **reloads the page**, after a hold or not, so one user's page and edits are never kept for, or saved as, the next; only text the user typed counts, so **every live search box carries `data-session-guard-ignore`** (contact lookup, processing search, manage-members, the admin pickers and permissions filter). Mark any new search input the same way, and call `useUnsavedChanges(dirty)` (`@/lib/unsaved-changes`) from a form whose unsaved state is not in a mounted text field, with a `dirty` that ends on save, cancel and close (a claim that outlives the edit keeps PII on screen indefinitely; `src/lib/session-guard-unsaved-wiring.test.ts` lists the five that exist: `QuickActionsPanel`'s notes, both detail modals' pause reason, and the journey and compliance tool editors, which compare their form with the state they loaded). Typed text that comes back in a new field (a pre-filled remount, such as a picker after "Refresh from MP") is not a field the user typed into, so a form that remounts its fields needs a declaration too. A pre-filled edit form must unmount or clear its fields after a successful save, or its text reads as unsaved. A visible tab is re-checked too: `sessionOptions.refetchInterval: 300` on the auth client (better-auth polls only while it holds a session) and the guard's `expiresAt` + 5 s timer. Both also run in hidden tabs, so **a hidden tab removes the page at once but starts sign-in only when shown**: `location.replace('/signin…')` waits for the first `visibilitychange` to visible, because tabs that end together would otherwise start parallel OAuth flows over the one `oauth_state` cookie (all but one end on `state_mismatch`; two windows both on screen are both visible and can still race), and on a shared PC a parked tab's flow could be completed by the next person. There is deliberately no cross-tab sign-out broadcast (reasons in the component)
- **`/signin` caps its own automatic navigations** (`src/lib/sign-in-loop.ts`, batch 6, upstream 595ecab adapted): the third OAuth start or already-signed-in bounce within 2 minutes in one tab is refused and the page shows a stop state linking to `/auth-error?error=sign_in_loop`. Every sessionStorage access is in a try/catch and a failure allows the navigation: the cap may weaken, sign-in may never break. SessionGuard clears the counter on a live session, so the cap does **not** stop a guard → `/signin` → callback → guard cycle (each lap passes a live session); such a cycle cannot start on its own, since both read the same `/get-session`
- **The current user's profile reaches the browser as a DTO** (`CurrentUserProfile`, `src/lib/dto/user-profile.ts`, batch 6, upstream 0670531 adapted): `getCurrentUserProfile` builds `First_Name`, `Nickname`, `Last_Name`, `Email_Address`, `Image_GUID` field by field, with no spread and no cast. `User_ID`, `User_GUID`, `Contact_ID`, `Mobile_Phone` and the group IDs stay on the server; `shared-actions/user.test.ts` pins the exact key set. Add a field only when the shell renders it
- **A sign-out control survives a missing profile** (batch 6, upstream f3cb739 adapted): the header mounts the user menu once loading ends, profile or not, and the `(web)` error boundary has its own Sign out. A staff member on a shared PC must never be left with no way out (the same reason `/session-error` exists)
- The proxy (`src/proxy.ts`) protects routes but only checks session presence — it does not check roles. It does not run on Server Action requests at all (since 2026-11-09, #252), so an action's own `requireSession()` is its only gate
- IDOR risk: server actions accept record IDs from clients without per-record authorization. When adding new endpoints that access sensitive data, consider whether the requesting user should have access to that specific record
- **Several IDs in one call must be bound to each other.** Checking scope on one ID (e.g. `participantId`) authorizes nothing about the others the caller sends with it (`contactId`, `groupParticipantId`). Either derive the related IDs on the server, or check that they belong together (N23, 2026-10-21: `assertParticipantIsContact` and `assertGroupParticipantBelongsTo` in both processing services). Likewise, re-derive a record's owner and type from the record itself before listing its files (`getRequirementFiles`). Every `enforceScope` denial is logged (`[scope:deny] <context>` in enforce mode, `[scope:report]` in report mode), so `context` must hold only numeric IDs and fixed literals
- **Every feature's writes are bound to that feature's records, not just its permission** (N2–N4, N7, 2026-10-27). manage-members: the member set (cached contacts with a `Member_Status_ID`) is the scope for milestone files (`getMembershipMilestoneParticipant` + membership journey), transitions (participant and contact must be the same member) and photos. Summer Blast: `addToSummerBlast` requires an intake-opportunity response owned by the contact, enrolls the response's own participant, and accepts only the temp role or a `roleConfigs` role; `removeFromSummerBlast` requires a tracking-group row. The shared photo upload `sanitizeId`s `Contact_ID` and leaves scope to the feature's service: journey and compliance call `assertContactInScope`; contact lookup is church-wide by design. Every check runs before the write and goes through `enforceScope`. **A write that end-dates a caller-named Group_Participants row needs that row to be active** (`End_Date IS NULL OR End_Date >= now`, the filter the cards use), or an ended row's history is rewritten: Summer Blast remove, and journey/compliance pause, resume and complete (2026-10-28). Complete also binds the row to the tool's tracking group, not merely to an in-scope participant

## Security Headers

Security headers are configured in `next.config.ts` via the `headers()` function. When modifying, ensure these headers remain present:
- `X-Frame-Options: DENY` — prevents clickjacking
- `X-Content-Type-Options: nosniff` — prevents MIME sniffing
- `Strict-Transport-Security` — enforces HTTPS
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` — disables unused browser APIs
- `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Resource-Policy: same-origin` (F14)

Three more `next.config.ts` settings are security controls (N14, 2026-11-18): `poweredByHeader: false`,
`images: { unoptimized: true }` (the optimizer is unauthenticated, since the proxy skips `/_next/image`, and
every `<Image>` already passes `unoptimized`), and `logging: { serverFunctions: false }` (`next dev` otherwise
logs Server Action arguments such as pastoral notes, and dev points at production MP).
`src/lib/next-config.test.ts` pins all of these values; `src/test-only-imports.test.ts` pins which options exist.

The CSP itself is per-request (it carries a nonce) and is built in `src/lib/security-headers.ts`, attached by
`src/proxy.ts`. `originOf` only returns http(s) origins with a plain `[a-z0-9.-]` hostname (N13), so a bad
env value can drop a source but never add a directive or a wildcard. `base-uri` is `'none'`.

**The proxy matcher's exclusions are bounded** (N9): directories end in `/`, files in `$` with the dot escaped,
`_next/image` is the endpoint or a path under it, and `/api` is public only as `/api` or `/api/...`. A new
exclusion must be bounded the same way; `src/proxy.test.ts` checks near-miss paths against the real `config`.

## Rate Limiting

Server actions are rate-limited per authenticated user via `src/lib/rate-limit.ts` (in-memory sliding window). The general limit is enforced automatically in `requireSession()`; stricter tiers must be called explicitly with `enforceRateLimit()`:

```typescript
import { enforceRateLimit } from "@/lib/rate-limit";

// In a write server action:
const session = await requireSession(); // auto-enforces "general" (120/min)
enforceRateLimit(session.user.id, "write"); // explicit stricter limit (30/min)
```

| Tier | Limit | Window | Applied to |
|------|-------|--------|------------|
| `general` | 120 req | 1 min | All server actions (via `requireSession()`) |
| `write` | 30 req | 1 min | Create/update/delete operations |
| `upload` | 10 req | 10 min | Photo and document uploads |
| `search` | 30 req | 1 min | Contact search (PII access) |
| `cacheRefresh` | 5 req | 1 hour | Dashboard cache invalidation |

### better-auth's own limiter (the sign-in endpoints)

Separate from the table above: better-auth rate-limits its own endpoints, **in production only**, keyed on `<client IP>|<path>`. `/sign-in/social` is **10 per 10 s** (`authRateLimitCustomRules` in `src/lib/auth.ts`; better-auth's built-in `/sign-in*` rule is 3, too few for staff behind one office IP when a deploy sends everyone back through sign-in).

The client IP comes from `AUTH_IP_ADDRESS_HEADERS` / `AUTH_TRUSTED_PROXIES` (`parseIpAddressOptions`). An invalid entry — including a trusted proxy that better-auth's own parser would warn about and drop, such as `fe80::1%lo0` — throws when `auth.ts` loads, so a typo in the operator step shows as every auth request returning 500 with an `[auth] …` log line while the container stays up and reports healthy. Check the log after setting them. Both blank is better-auth's default: `x-forwarded-for`, trusted only when it holds a single valid IP. Verified in better-auth 1.7.5 (`dist/api/rate-limiter/index.mjs`; through 1.7.18 that file only adds a JSON `Content-Type` to the 429 and a number coercion) and on a local production build:

- A request whose IP cannot be resolved — the configured header missing, or a multi-hop `x-forwarded-for` chain — is **not** skipped. It is counted in **one shared bucket per path** (`no-trusted-ip|<path>`), and the process logs `Rate limiting could not determine a client IP and is falling back to a single shared per-path bucket` **once**.
- `AUTH_IP_ADDRESS_HEADERS` **replaces** `x-forwarded-for`; it is not a fallback.
- Name a header only if the edge always overwrites it (`cf-connecting-ip` when every request arrives through Cloudflare). A header clients can set lets them rotate past the limit or lock someone else out. With nothing in front, `next start` fills a missing `x-forwarded-for` with the socket address, and a client-supplied one is believed.

When adding new server actions:
- **Read-only actions**: No extra work — `requireSession()` handles the general limit
- **Write actions**: Add `enforceRateLimit(session.user.id, "write")` after `requireSession()`
- **File uploads**: Add `enforceRateLimit(session.user.id, "upload")` after `requireSession()`

## Security Audit Reference

The full security audit report is at `.claude/notes/security-audit-2026-02-24.md`. It documents all 15 findings, their status, and remaining open items (RBAC, IDOR mitigation).

Pre-PR security review checklist: `.claude/notes/security-review-checklist.md`
