import type { OAuthConfig, OAuthUserConfig } from "next-auth/providers";
import type { MinistryPlatformProfile } from "./types";

export default function MinistryPlatform<P extends MinistryPlatformProfile>(
  options: OAuthUserConfig<P>
): OAuthConfig<P> {
  const mpBaseUrl = process.env.MINISTRY_PLATFORM_BASE_URL;
  const mpOauthUrl = `${mpBaseUrl}/oauth`;
  
  console.log('MinistryPlatform provider initialized with base URL:', mpBaseUrl);
  console.log('OAuth URL:', mpOauthUrl);
  
  return {
    id: "ministryplatform",
    name: "MinistryPlatform",
    type: "oauth",
    wellKnown: `${mpOauthUrl}/.well-known/openid-configuration`,
    issuer: mpOauthUrl,
    authorization: {
      url: `${mpOauthUrl}/connect/authorize`,
      params: {
        scope: "openid offline_access http://www.thinkministry.com/dataplatform/scopes/all",
        response_type: "code",
        realm: "realm",
      },
    },
    token: {
      url: `${mpOauthUrl}/connect/token`,
      params: {
        grant_type: "authorization_code",
      },
    },
    userinfo: {
      url: `${mpOauthUrl}/connect/userinfo`,
    },
    checks: ["state"],
    profile(profile) {
      console.log('MinistryPlatform profile function called with:', profile);
      return {
        id: profile.sub,
        name: `${profile.given_name} ${profile.family_name}`,
        firstName: profile.given_name,
        lastName: profile.family_name,
        email: profile.email,
        image: null,
        sub: profile.sub,
        userId: profile.sub,
        username: profile.name,
        user_id: profile.user_id
      };
    },
    options,
  };
}
