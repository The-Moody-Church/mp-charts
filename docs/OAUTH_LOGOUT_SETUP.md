# OAuth Logout Configuration for Ministry Platform

> **Scope.** This applies to all four apps built on this auth stack — mp-charts,
> mp-senior-care, event-manager and music-db. They share **one** Ministry
> Platform OAuth client, `MPNext`, so the MP-side configuration below is a
> single change that covers every app.

## Current status, 2026-09-18

| | State |
|---|---|
| App session cleared on sign-out | ✅ working |
| MP OIDC session terminated on sign-out | ✅ working |
| `id_token_hint` sent on the end-session request | ✅ **as of 2026-09-18** |
| Post-logout redirect URLs registered on the `MPNext` client | ❌ **outstanding** |
| User returned to the app after sign-out | ❌ blocked on the row above |

**What this means today.** Sign-out is correct and complete in the way that
matters: the MP session is genuinely terminated, so signing in again requires
credentials rather than silently resuming. What does not work is the return
trip — the browser is left on MP's logged-out page and the user navigates back
themselves.

### Correcting this document

An earlier version of this file claimed the whole flow was implemented and
working, and showed `id_token_hint={ID_TOKEN}` in the URL as though the code
sent it. **It did not.** The code sent `post_logout_redirect_uri` alone from the
Better Auth migration until 2026-09-18.

That gap went unnoticed for months precisely because this document said it was
done. If you change the flow, change this file in the same commit.

## The MP-side change that is still needed

Register these as **Post-Logout Redirect URIs** on the `MPNext` OAuth client.
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

**Both halves are required.** The hint without registration still strands the
user. Registration without the hint does nothing, because MP never gets far
enough to consult the list.

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

Order matters in the action: the ID token is read from the user's MP account
record **before** `auth.api.signOut`, because the session is how the user is
identified and signing out destroys it.

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

Once the URLs are registered, sign out of **any one** of the four apps. Because
they share the `MPNext` client, a successful return proves it for all of them.

1. Sign in.
2. Sign out. You should pass through MP briefly and land back on the app.
3. Sign in again. You should be asked for credentials, not signed in silently.

Step 3 works today. Step 2 is what the registration unlocks.

If you still land on MP, check the registered string against `BETTER_AUTH_URL`
character for character before looking anywhere else.

## References

- [OpenID Connect RP-Initiated Logout](https://openid.net/specs/openid-connect-rpinitiated-1_0.html) — `id_token_hint` and `post_logout_redirect_uri`
- [Better Auth](https://www.better-auth.com/)
