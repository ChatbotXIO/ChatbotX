import { prisma } from "@ahachat.ai/database"
import { PrismaAdapter } from "@auth/prisma-adapter"
import NextAuth from "next-auth"
import type { OAuthConfig, OAuthUserConfig } from "next-auth/providers"
import type { GoogleProfile } from "next-auth/providers/google"
import Google from "next-auth/providers/google"

const googleSheetsScopes = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/drive.file",
]

export default function GoogleSheets<P extends GoogleProfile>(
  options: OAuthUserConfig<P>,
): OAuthConfig<P> {
  return {
    id: "google",
    name: "Google",
    type: "oauth",
    issuer: "https://accounts.google.com",
    style: {
      brandColor: "#1a73e8",
    },
    options,
  }
}

export const { handlers, auth, signIn } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      authorization: {
        params: {
          scope: googleSheetsScopes.join(" "),
          access_type: "offline",
          prompt: "consent",
        },
      },
      idToken: false,
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      console.log("accountttttttt", account)
      console.log("profileeeeeee", profile)
      if (account && profile) {
        return true
      }

      return false
    },
  },
})
