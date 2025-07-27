import { prisma } from "@ahachat.ai/database"
import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { magicLink } from "better-auth/plugins"
import { headers } from "next/headers"
import { googleSignInConfig } from "./auth-config"
import { sendMagicLinkMail } from "@ahachat.ai/mail"

export const getCurrentUserId = async (): Promise<string> => {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  return session?.user.id || "unknown"
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  socialProviders: {
    google: googleSignInConfig,
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLinkMail(email, {
          url,
        })
      },
    }),
  ],
})
