import NextAuth from "next-auth"

declare module "next-auth" {
  interface Session {
    accessToken?: string
    firstName: string
    lastName: string
    sub: string
    name?: string | null
    email?: string | null
  }

  interface JWT {
    accessToken?: string
    refreshToken?: string
    expiresAt?: number
    sub?: string
    userId?: string
    firstName?: string
    lastName?: string
  }
}