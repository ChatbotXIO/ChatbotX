import {
  platformCredentialService,
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
  DEFAULT_FORGOT_PASSWORD_SUBJECT,
  DEFAULT_MAGIC_LINK_SUBJECT,
  DEFAULT_SIGNUP_SUBJECT,
  sendMagicLink,
  sendResetPassword,
  sendSignUpVerification,
} from "@chatbotx.io/mail"
import { getPublicOriginFromRequest } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { APIError, betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { anonymous, magicLink, oneTimeToken } from "better-auth/plugins"
import { PHASE_PRODUCTION_BUILD } from "next/constants"

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
        if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) {
          return {
            enabled: false,
            clientId: "",
            clientSecret: "",
          }
        }

        try {
          const googleCredential =
            await platformCredentialService.findDecryptedPlatform({
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
        } catch {
          return await {
            enabled: false,
            clientId: "",
            clientSecret: "",
          }
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

        const {
          name: brandName,
          logoLightUrl,
          forgotPasswordEmailTemplate,
        } = platformInfo

        await sendResetPassword(user.email, {
          brandName,
          brandLogoUrl: logoLightUrl,
          brandUrl: new URL("/", originUrl).toString(),
          subject: DEFAULT_FORGOT_PASSWORD_SUBJECT,
          userName: user.name ?? user.email,
          resetPasswordUrl: url,
          customTemplate: forgotPasswordEmailTemplate,
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
        const {
          name: brandName,
          logoLightUrl,
          signupEmailTemplate,
        } = platformInfo

        await sendSignUpVerification(user.email, {
          brandName,
          brandLogoUrl: logoLightUrl,
          brandUrl: new URL("/", originUrl).toString(),
          subject: DEFAULT_SIGNUP_SUBJECT,
          userName: user.name ?? user.email,
          verificationUrl: url,
          customTemplate: signupEmailTemplate,
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
          const {
            name: brandName,
            logoLightUrl,
            magicLinkEmailTemplate,
          } = platformInfo

          const user = await db.query.userModel.findFirst({ where: { email } })
          if (!user) {
            throw new APIError(400, {
              message: `Your email is not registered with ${brandName}`,
            })
          }

          await sendMagicLink(email, {
            brandName,
            brandLogoUrl: logoLightUrl,
            brandUrl: new URL("/", originUrl).toString(),
            subject: DEFAULT_MAGIC_LINK_SUBJECT,
            userName: user.name ?? email,
            magicUrl: url,
            customTemplate: magicLinkEmailTemplate,
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
