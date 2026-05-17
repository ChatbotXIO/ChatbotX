import {
  organizationCredentialService,
  organizationService,
} from "@chatbotx.io/business"
import { db } from "@chatbotx.io/database/client"
import {
  accountModel,
  sessionModel,
  userModel,
  verificationModel,
} from "@chatbotx.io/database/schema"
import {
  sendMagicLink,
  sendResetPassword,
  sendSignUpVerification,
} from "@chatbotx.io/mail"
import { getPublicOriginFromRequest } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { APIError, betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { anonymous, magicLink, oneTimeToken } from "better-auth/plugins"

export type AuthConfig = {
  brandName?: string
  brandUrl: string
}

export function createAuth(config: AuthConfig) {
  const brandName = config.brandName ?? "ChatbotX"

  return betterAuth({
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
      google: async () => {
        // TODO: support white-labeling
        // TODO: ignore if the organization is a community
        const organization = await organizationService.find({ where: {} })
        if (!organization) {
          return await {
            enabled: false,
            clientId: "",
            clientSecret: "",
          }
        }

        const googleCredential =
          await organizationCredentialService.findDecrypted({
            organizationId: organization.id,
            type: "google",
          })
        if (!googleCredential) {
          return await {
            enabled: false,
            clientId: "",
            clientSecret: "",
          }
        }

        return await {
          enabled: true,
          clientId: googleCredential.config.clientId,
          clientSecret: googleCredential.config.clientSecret,
        }
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: async ({ user, url }, request) => {
        if (!request) {
          throw new APIError(400, {
            message: "Unknown request",
          })
        }

        const originUrl = await getPublicOriginFromRequest(
          request as unknown as Request,
        )

        await sendResetPassword(user.email, {
          brandName,
          brandLogoUrl: new URL("/brand/logo_white.svg", originUrl).toString(),
          brandUrl: new URL("/", originUrl).toString(),
          subject: "Reset your password",
          userName: user.name ?? user.email,
          resetPasswordUrl: url,
        })
      },
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }, request) => {
        if (!request) {
          throw new APIError(400, {
            message: "Unknown request",
          })
        }

        const originUrl = await getPublicOriginFromRequest(
          request as unknown as Request,
        )

        await sendSignUpVerification(user.email, {
          brandName,
          brandLogoUrl: new URL("/brand/logo_white.svg", originUrl).toString(),
          brandUrl: new URL("/", originUrl).toString(),
          subject: `${brandName} Email Verification`,
          userName: user.name ?? user.email,
          verificationUrl: url,
        })
      },
    },
    plugins: [
      magicLink({
        sendMagicLink: async ({ email, url }, request) => {
          if (!request) {
            throw new APIError(400, {
              message: "Unknown request",
            })
          }

          const originUrl = await getPublicOriginFromRequest(
            request as unknown as Request,
          )

          const user = await db.query.userModel.findFirst({ where: { email } })
          if (!user) {
            throw new APIError(400, {
              message: "Your email is not registered with ChatbotX",
            })
          }

          await sendMagicLink(email, {
            brandName,
            brandLogoUrl: new URL(
              "/brand/logo_white.svg",
              originUrl,
            ).toString(),
            brandUrl: new URL("/", originUrl).toString(),
            subject: "Verify your email",
            userName: user.name ?? email,
            magicUrl: url,
          })
        },
      }),
      oneTimeToken(),
      anonymous({
        emailDomainName: "anonymous.example.com",
        generateName: () => `Anonymous ${createId()}`,
      }),
    ],
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
        strategy: "compact",
      },
    },
    advanced: {
      database: {
        generateId: "serial",
      },
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
