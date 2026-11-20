import type { MPUserProfile } from "@/lib/providers/ministry-platform/types";

/**
 * The signed-in user's own profile, as the browser receives it from
 * `getCurrentUserProfile` (upstream MPNext 0670531, adapted).
 *
 * Exactly the fields the shell renders: the header avatar and its title
 * (`header.tsx`), and the user menu's name and email (`user-menu.tsx`). Nothing
 * else in the client reads `userProfile`. The server-side profile
 * (`MPUserProfile`) also carries `User_ID`, `User_GUID`, `Contact_ID`,
 * `Mobile_Phone`, the user's group names and `userGroupIds`; those stay on the
 * server (`getUserAuthorization` reads `userGroupIds` there).
 *
 * The name fields are nullable because MP's `Contacts` columns are
 * (`models/Contacts.ts`); both renderers already fall back when one is empty.
 */
export interface CurrentUserProfile {
  First_Name: string | null;
  Nickname: string | null;
  Last_Name: string | null;
  Email_Address: string | null;
  Image_GUID: string | null;
}

/**
 * Builds the DTO field by field. No spread and no cast: a field added to the
 * service's select, or to `MPUserProfile`, must not reach the browser unseen.
 * `src/components/shared-actions/user.test.ts` pins the exact key set.
 */
export function toCurrentUserProfile(
  profile: Pick<MPUserProfile, "First_Name" | "Nickname" | "Last_Name" | "Email_Address" | "Image_GUID">
): CurrentUserProfile {
  return {
    First_Name: profile.First_Name ?? null,
    Nickname: profile.Nickname ?? null,
    Last_Name: profile.Last_Name ?? null,
    Email_Address: profile.Email_Address ?? null,
    Image_GUID: profile.Image_GUID ?? null,
  };
}
