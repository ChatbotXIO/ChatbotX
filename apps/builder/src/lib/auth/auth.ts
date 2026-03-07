import { db } from "@aha.chat/database/client"
import {
  accountModel,
  jwkModel,
  sessionModel,
  userModel,
  verificationModel,
} from "@aha.chat/database/schema"
import {
  sendMagicLink,
  sendResetPassword,
  sendSignUpVerification,
} from "@aha.chat/mail"
import { stripe } from "@better-auth/stripe"
import { createId } from "@paralleldrive/cuid2"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import {
  anonymous,
  jwt,
  magicLink,
  oneTimeToken,
  organization,
} from "better-auth/plugins"
import Stripe from "stripe"
import { env, isCommunity } from "@/env"

import { googleSignInConfig } from "./auth-config"

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: userModel,
      verification: verificationModel,
      session: sessionModel,
      account: accountModel,
      jwks: jwkModel,
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
    // NOTES: use this plugin for chatbot
    organization({
      allowUserToCreateOrganization: true,
      organizationLimit: async () => {
        if (!isCommunity) {
          return await Promise.resolve(false)
        }

        return await Promise.resolve(true)

        // const chatbotsCount = await db.$count(chatbotModel, eq(chatbotModel.organizationId, user.id))
      },
      schema: {
        organization: {
          modelName: "Chatbot",
        },
        member: {
          modelName: "ChatbotMember",
          fields: {
            organizationId: "chatbotId",
          },
        },
        team: {
          modelName: "InboxTeam",
          fields: {
            organizationId: "chatbotId",
          },
        },
        teamMember: {
          modelName: "InboxTeamMember",
          fields: {
            teamId: "inboxTeamId",
          },
        },
      },
    }),
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
    jwt(),
    stripe({
      stripeClient: new Stripe(env.STRIPE_SECRET_KEY),
      stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
      createCustomerOnSignUp: true,
      subscription: {
        enabled: true,
        plans: async () => {
          console.log("debugggggg", arguments)

          return await Promise.resolve([])
        },
        // plans: async () => {
        // console.log("debugggggg", arguments)
        // const plans = await db.query.billingPlanModel.findMany({
        //   where: {
        //     organizationId: {
        //       in: (await db.query.organizationModel.findMany()).map(
        //         (o) => o.id,
        //       ),
        //     },
        //   },
        // })
        //   return await Promise.resolve([])
        // },
      },
      organization: {
        enabled: true,
      },
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
