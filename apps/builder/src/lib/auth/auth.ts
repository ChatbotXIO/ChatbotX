import { db } from "@aha.chat/database/client"
import {
  accountModel,
  sessionModel,
  userModel,
  verificationModel,
} from "@aha.chat/database/schema"
import {
  sendMagicLink,
  sendResetPassword,
  sendSignUpVerification,
} from "@aha.chat/mail"
import { createId } from "@paralleldrive/cuid2"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { anonymous, magicLink, oneTimeToken } from "better-auth/plugins"
import { env } from "@/env"
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
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await sendResetPassword(user.email, {
        brandName: "ChatbotX",
        brandLogoUrl: new URL(
          "/brand/logo_white.svg",
          env.NEXT_PUBLIC_ASSET_URL,
        ).toString(),
        brandUrl: env.NEXT_PUBLIC_BUILDER_URL,
        subject: "Reset your password",
        userName: user.name ?? user.email,
        resetPasswordUrl: url,
      })
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendSignUpVerification(user.email, {
        brandName: "ChatbotX",
        brandLogoUrl: new URL(
          "/brand/logo_white.svg",
          env.NEXT_PUBLIC_ASSET_URL,
        ).toString(),
        brandUrl: env.NEXT_PUBLIC_BUILDER_URL,
        subject: "ChatbotX Email Verification",
        userName: user.name ?? user.email,
        verificationUrl: url,
      })
    },
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        const user = await db.query.userModel.findFirst({
          where: { email },
        })
        if (!user) {
          return
        }

        await sendMagicLink(email, {
          brandName: "ChatbotX",
          brandLogoUrl: new URL(
            "/brand/logo_white.svg",
            env.NEXT_PUBLIC_ASSET_URL,
          ).toString(),
          brandUrl: env.NEXT_PUBLIC_BUILDER_URL,
          subject: "Verify your email",
          userName: user.name ?? email,
          magicUrl: url,
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
