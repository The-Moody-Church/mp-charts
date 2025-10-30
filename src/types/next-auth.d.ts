import { DefaultSession } from "next-auth"
import { MPUserProfile } from "@/lib/providers/ministry-platform/types"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
    } & DefaultSession["user"]
    accessToken?: string
    firstName?: string
    lastName?: string
    email?: string
    sub?: string
    userProfile?: MPUserProfile | null
  }

  interface JWT {
    accessToken?: string
    refreshToken?: string
    expiresAt?: number
    userId?: string
    firstName?: string
    lastName?: string
    userProfile?: MPUserProfile | null
  }
}