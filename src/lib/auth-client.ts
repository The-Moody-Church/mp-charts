"use client";

import { createAuthClient } from "better-auth/react";
import { customSessionClient } from "better-auth/client/plugins";
import type { auth } from "./auth";

// better-auth 1.7 removed genericOAuthClient: generic providers are reached
// through the core signIn.social / callback/:id endpoints.
export const authClient = createAuthClient({
  plugins: [customSessionClient<typeof auth>()],
});
