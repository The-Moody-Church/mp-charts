# OAuth Logout Configuration for Ministry Platform

> **Scope.** This applies to all four apps built on this auth stack — mp-charts,
> mp-senior-care, event-manager and music-db. They share **one** Ministry
> Platform sign-in client, `TM.Widgets` (`OIDC_CLIENT_ID`), so the MP-side
> configuration below is a single change that covers every app.
>
> **Correction, 2026-09-24.** Earlier revisions of this page said `MPNext`.
> `MPNext` is only the server-to-server data client (`MINISTRY_PLATFORM_CLIENT_ID`).
> Every app signs in, and signs out, through `TM.Widgets`, so that is the client
> whose lists matter.

## Current status, 2026-09-22 — working end to end

| | State |
|---|---|
| App session cleared on sign-out | ✅ |
| MP OIDC session terminated on sign-out | ✅ |
| `id_token_hint` sent on the end-session request | ✅ |
| Post-logout redirect URLs registered on the sign-in client (`TM.Widgets`) | ✅ |
| User returned to the app after sign-out | ✅ verified on care.moodychurch.app |

All four apps share the `TM.Widgets` client and the same code, so a successful
return on one is strong evidence for the rest. Spot-check the others if you
want certainty.

### What finally fixed it, and what did not

Three things were wrong at different times. Worth recording, because two of
them were invisible and the first one sent the investigation the wrong way.

**1. The hint was never sent.** The code sent `post_logout_redirect_uri` alone
from the Better Auth migration until 2026-09-18. MP runs IdentityServer, which
honours that parameter ONLY when `id_token_hint` is also present — the hint
identifies the client, and without knowing the client it cannot validate the
URI against that client's registered list.

**2. The first attempt to send it did not work, silently.** It read the token
back from the account record with `findAccountByUserId`, which returns nothing
here. `session.cookieCache.strategy: "jwt"` means the session rides in the
cookie and never touches a store, so the session looks healthy; and with no
`database` configured, accounts live in an in-memory adapter belonging to
whichever module instance created it. Sign-in runs in a route handler,
sign-out in a server action, and those are separate bundles. Written to one
instance's memory, read from another's.

Fixed on 2026-09-22 by capturing the token at sign-in in `getUserInfo` and
parking it on `globalThis` — see `src/lib/id-token-store.ts`. The same
chunk-duplication problem this codebase already documents for `serviceCache`.

**3. Neither failure surfaced.** Sign-out still worked, so nothing errored and
nothing logged. Two explanations survived for days and no amount of reasoning
could separate them. What settled it was a one-line warning that fires when the
hint cannot be sent, with the reason. It reported `no-mp-account` on the first
real sign-out and pointed straight at cause 2.

**That warning is still in the sign-out action. Leave it there.** If sign-out
ever strands users on MP again, one sign-out tells you whether the app stopped
sending the hint (warning present, with the reason) or something changed on the
MP side (no warning).

### Verified rather than assumed

Re-tested 2026-09-22: hitting the end-session endpoint with
`post_logout_redirect_uri` and NO hint still returns a logout page carrying
`window.returnUrl = ""`. So the hint is what makes the difference, not a change
on MP's side. `client_id` is not an accepted substitute here either, despite
being allowed by the RP-Initiated Logout spec.

## Reference: the MP-side registration

Register these as **Post-Logout Redirect URIs** on the `TM.Widgets` OAuth client.
All four in one list; a client holds a list, and the apps share the client.

```
https://mptools.moodychurch.org
https://care.moodychurch.app
https://events.moodychurch.app
https://musictools.moodychurch.org
```

For local development, add as needed:

```
http://localhost:3000
```

**Match exactly.** IdentityServer compares the `post_logout_redirect_uri`
parameter against the registered list as a literal string. A trailing slash on
one side and not the other is a mismatch. The apps send exactly
`BETTER_AUTH_URL` with no trailing slash and no path, which is why the list
above has neither.

### Sign-in redirect URIs (same client, separate list)

better-auth 1.7 returns users to `/api/auth/callback/ministryplatform`. Our
providerId has **no hyphen**; upstream MPNext's `ministry-platform` path is not
ours. The **Redirect URIs** list on `TM.Widgets` needs, per app:

```
https://mptools.moodychurch.org/api/auth/callback/ministryplatform
https://care.moodychurch.app/api/auth/callback/ministryplatform
https://events.moodychurch.app/api/auth/callback/ministryplatform
https://musictools.moodychurch.org/api/auth/callback/ministryplatform
http://localhost:3000/api/auth/callback/ministryplatform
```

Keep the 1.6 entries (`…/api/auth/oauth2/callback/ministryplatform`) until no
deployment can roll back to a 1.6 build: a rolled-back image sends the old
path. The post-logout list above does not change.

#### Verify the registration (before any soak)

A missing entry fails on **MP's** error page, so it never reaches our
`/auth-error` page or our logs. Check each URI with a request that follows no
redirects and sends no credentials:

```bash
curl -s -o /tmp/p.html -w '%{http_code} %{redirect_url}\n' \
  "https://moody.ministryplatform.com/ministryplatformapi/oauth/connect/authorize?response_type=code&client_id=TM.Widgets&scope=openid&state=probe&redirect_uri=<url-encoded URI>"
```

- `302` to `…/oauth/login?signin=…` means the URI is **registered**.
- `200` means MP refused it. Confirm with `grep 'not registered for the client' /tmp/p.html`.

Run it for all four hosts and localhost, on **both** the new
`/api/auth/callback/ministryplatform` path (must be `302` before that app's
first 1.7 soak) and the old `/api/auth/oauth2/callback/ministryplatform` path
(must stay `302` while any rollback to 1.6 is possible).

**Where.** Not through the MP REST API. Confirmed on 2026-09-18: there is no
OAuth client table in the data dictionary, the OIDC discovery document
advertises no `registration_endpoint`, and there is no Platform page view for
API clients. This is MP administrative configuration, so it goes through
whoever administers the MP tenant.

## Why `id_token_hint` is not optional

MP runs IdentityServer, which honours `post_logout_redirect_uri` **only when
`id_token_hint` is also present**. The hint identifies the client; without it
the server cannot validate the URI against that client's registered list, so it
discards the parameter and shows its own logged-out page.

The observable tell is MP's logout page serving:

```js
window.returnUrl = "";
```

That page exists to bounce the browser back to whoever started the logout. An
empty `returnUrl` means MP could not work out where "back" was.

**Both halves are required**, which is what made this hard to diagnose: either
one missing produces the identical symptom. The hint without registration
strands the user; registration without the hint does nothing, because MP never
gets far enough to consult the list.

## How it is implemented

`src/lib/auth-endsession.ts` builds the URL. `src/components/user-menu/actions.ts`
(`src/components/layout/actions.ts` in music-db) reads the ID token and calls it.

```
${MINISTRY_PLATFORM_BASE_URL}/oauth/connect/endsession
  ?post_logout_redirect_uri=${BETTER_AUTH_URL}
  &id_token_hint=${ID_TOKEN}
```

`MINISTRY_PLATFORM_BASE_URL` already ends in `/ministryplatformapi`, so the
builder does not add it. The result matches the `end_session_endpoint` in MP's
discovery document exactly.

Order matters in the action: the ID token is read **before** `auth.api.signOut`,
because the session is how the user is identified and signing out destroys it.
The primary source is `src/lib/id-token-store.ts`, filled at sign-in inside
`getUserInfo`; the user's MP account record is only a fallback, and in practice
is empty (see that file). `disableProviderLogout: true` keeps better-auth 1.7's
own end-session URL out of the way, because it reads that same empty record.

### It degrades rather than fails

The token lookup never throws. These apps use Better Auth's in-memory adapter,
so a session predating a container restart has no stored account to read — a
normal state, not an error. With no hint the URL is still valid: the user is
still signed out, just left on MP's page.

### The Content-Security-Policy has to allow it

The end-session redirect is a cross-origin navigation, and `form-action`
governs the **whole redirect chain**, not just its first hop. Every app's
policy names the MP origin through `formActionOrigin` in `src/proxy.ts`. The
policy is **enforced** in production, so removing that would break sign-out for
real users rather than producing a console warning.

## Environment variables

```env
MINISTRY_PLATFORM_BASE_URL=https://moody.ministryplatform.com/ministryplatformapi
BETTER_AUTH_URL=https://mptools.moodychurch.org   # this app's own origin
```

`BETTER_AUTH_URL` is what gets sent as the post-logout URI, so it must appear
verbatim in the registered list above.

## Testing

Sign out of **any one** of the four apps. Because they share the `TM.Widgets`
client, a successful return proves it for all of them.

1. Sign in.
2. Sign out. You should pass through MP briefly and land back on the app.
3. Sign in again. You should be asked for credentials, not signed in silently.

Both steps pass as of 2026-09-22.

**If it regresses, check the logs first.** A `[signout]` warning means the app
stopped sending the hint and the reason says why. No warning means the app is
doing its part and the problem is MP-side — check the registered string against
`BETTER_AUTH_URL` character for character.

## References

- [OpenID Connect RP-Initiated Logout](https://openid.net/specs/openid-connect-rpinitiated-1_0.html) — `id_token_hint` and `post_logout_redirect_uri`
- [Better Auth](https://www.better-auth.com/)
