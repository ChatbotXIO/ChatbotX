import {
  organizationCredentialService,
  organizationService,
  resolvePlatformSettingsByDomain,
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

const getPlatformSettings = async (request: Request) => {
  const domain = request.headers.get("x-domain") ?? ""
  return await resolvePlatformSettingsByDomain(domain)
}

export type AuthConfig = Record<string, unknown>

export function createAuth(_config: AuthConfig) {
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

        const [originUrl, platformInfo] = await Promise.all([
          getPublicOriginFromRequest(request as unknown as Request),
          getPlatformSettings(request),
        ])

        const { name: brandName, logo } = platformInfo
        await sendResetPassword(user.email, {
          brandName,
          brandLogoUrl:
            logo ?? new URL("/brand/logo_white.svg", originUrl).toString(),
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

        const [originUrl, platformInfo] = await Promise.all([
          getPublicOriginFromRequest(request as unknown as Request),
          getPlatformSettings(request),
        ])
        const { name: brandName, logo } = platformInfo

        await sendSignUpVerification(user.email, {
          brandName,
          brandLogoUrl:
            logo ?? new URL("/brand/logo_white.svg", originUrl).toString(),
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

          const [originUrl, platformInfo] = await Promise.all([
            getPublicOriginFromRequest(request as unknown as Request),
            getPlatformSettings(request as unknown as Request),
          ])
          const { name: brandName, logo } = platformInfo

          const user = await db.query.userModel.findFirst({ where: { email } })
          if (!user) {
            throw new APIError(400, {
              message: `Your email is not registered with ${brandName}`,
            })
          }

          await sendMagicLink(email, {
            brandName,
            brandLogoUrl:
              logo ?? new URL("/brand/logo_white.svg", originUrl).toString(),
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
