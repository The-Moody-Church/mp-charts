# OAuth Logout Configuration for Ministry Platform

## Current Status
✅ Full sign-out implemented using Better Auth with OIDC RP-initiated logout
✅ OIDC RP-initiated logout configured

## What's Working
- Application-level session termination via Better Auth sign-out
- Better Auth clears local session cookies
- OIDC RP-initiated logout ends Ministry Platform OAuth session
- User is fully logged out of both the Next.js application and Ministry Platform

## Configuration Required

### 1. Ministry Platform OAuth Configuration
You need to register **Post-Logout Redirect URIs** in your Ministry Platform OAuth client settings:

**Production:**
```
https://yourdomain.com/
https://yourdomain.com/signin
```

**Development:**
```
http://localhost:3000/
http://localhost:3000/signin
```

### 2. Implementation Details

#### OIDC RP-Initiated Logout Flow:
When a user clicks "Sign out", the implementation:
1. ✅ Destroys Better Auth session (JWT cookie)
2. ✅ Redirects to Ministry Platform's end_session endpoint to terminate the OAuth session
3. ✅ Ministry Platform redirects back to the application's post-logout URI

#### How it works:
The `signOut()` function redirects to Ministry Platform's end_session endpoint:

```
${MINISTRY_PLATFORM_BASE_URL}/oauth/connect/endsession?
  id_token_hint={ID_TOKEN}&
  post_logout_redirect_uri={YOUR_APP_URL}
```

**Why this matters:**
- Without OIDC logout, users remain authenticated at Ministry Platform
- If they click "Sign in" again, they're auto-logged back in (SSO)
- True logout requires ending the session at both application AND identity provider

### 3. Environment Variables
Ensure these are set:

```env
MINISTRY_PLATFORM_BASE_URL=https://your-mp-instance.com
BETTER_AUTH_URL=https://yourdomain.com  # Production
BETTER_AUTH_URL=http://localhost:3000   # Development
```

### 4. Testing

**Test full OIDC logout:**
1. Sign in to application
2. Click "Sign out"
3. Should redirect to Ministry Platform briefly
4. Then redirect back to your app
5. Try signing in again - should require credentials (not auto-login)

## References
- [OpenID Connect RP-Initiated Logout Spec](https://openid.net/specs/openid-connect-rpinitiated-1_0.html)
- [Better Auth Documentation](https://www.better-auth.com/)

## Implementation Summary

**Option A (Full OIDC Logout) — Currently Implemented:**
- Pros: True logout from identity provider, no auto-login
- Cons: Requires Ministry Platform configuration (Post-Logout Redirect URIs)
- Uses Better Auth's `genericOAuth` plugin with RP-initiated logout flow

Currently implemented: **Option A (Full OIDC Logout)**
