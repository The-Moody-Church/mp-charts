"use client";

import { ArrowRightOnRectangleIcon } from "@heroicons/react/24/outline";
import { MPUserProfile } from "@/lib/providers/ministry-platform/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { handleSignOut } from "./actions";

/**
 * Re-mints the session cookie cache just before signing out. A cheap backup,
 * NO LONGER REQUIRED.
 *
 * `handleSignOut` needs the session to find the user's ID token for
 * `id_token_hint`. Until 2026-09-29 each Next bundle layer had its own auth
 * instance, so the server action could read the session only from the
 * one-hour JWT cookie cache (`session_data`) and this refresh was what kept
 * the hint after an idle hour. `src/lib/auth.ts` now shares one instance per
 * process (`sharedInstance`), so the action reads the same store as
 * `GET /api/auth/get-session` and finds the session with or without a fresh
 * cookie. Kept because it costs one request and is harmless; a new sign-out
 * caller does not need it.
 *
 * It must never block sign-out: any failure here only means signing out
 * without the refresh, which is still signing out.
 */
async function refreshSessionCookie(): Promise<void> {
  try {
    await authClient.getSession();
  } catch {
    // Sign-out still proceeds; at worst it goes without the hint.
  }
}

interface UserMenuProps {
  onClose?: () => void;
  userProfile: MPUserProfile;
  children: React.ReactNode;
}

const userMenuItems = [
  {
    name: "Sign out",
    action: "signout",
    icon: ArrowRightOnRectangleIcon,
  },
];

export function UserMenu({ onClose, userProfile, children }: UserMenuProps) {
  const handleItemClick = async (action: string) => {
    if (onClose) {
      onClose();
    }
    if (action === "signout") {
      await refreshSessionCookie();
      await handleSignOut();
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-48 bg-[#344767] border-[#344767]"
        align="end"
      >
        <DropdownMenuLabel className="text-white">
          <div className="flex flex-col space-y-1">
            <p className="font-medium text-white">
              {userProfile.Nickname || userProfile.First_Name}{" "}
              {userProfile.Last_Name}
            </p>
            <p className="text-sm text-gray-300">{userProfile.Email_Address}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-gray-500" />
        {userMenuItems.map((item) => (
          <DropdownMenuItem
            key={item.name}
            onClick={() => handleItemClick(item.action)}
            className="cursor-pointer text-white hover:bg-[#2d3a5f] focus:bg-[#2d3a5f]"
          >
            <item.icon className="mr-2 h-4 w-4 text-white" />
            {item.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
