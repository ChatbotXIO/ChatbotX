import { prisma } from "@aha.chat/database"
import { sendMagicLinkMail } from "@aha.chat/mail"
import { createId } from "@paralleldrive/cuid2"
import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { anonymous, magicLink, oneTimeToken } from "better-auth/plugins"
import { googleSignInConfig } from "./auth-config"

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  socialProviders: {
    google: googleSignInConfig,
  },
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLinkMail(email, {
          brandName: "ChatbotX",
          brandUrl: url,
        })
      },
    }),
    oneTimeToken(),
    anonymous({
      emailDomainName: "anonymous.aha.chat",
      generateName: () => `Anonymous ${createId()}`,
    }),
  ],
})
