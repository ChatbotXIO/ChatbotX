import { db } from "@aha.chat/database/client"
import {
  accountModel,
  sessionModel,
  userModel,
  verificationModel,
} from "@aha.chat/database/schema"
import { sendMagicLinkMail } from "@aha.chat/mail"
import { createId } from "@paralleldrive/cuid2"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { anonymous, magicLink, oneTimeToken } from "better-auth/plugins"
import { googleSignInConfig } from "./auth-config"

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: userModel,
      verification: verificationModel,
      session: sessionModel,
      account: accountModel,
    },
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
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // Cache duration in seconds (5 minutes)
      strategy: "compact", // or "jwt" or "jwe"
    },
  },
})
