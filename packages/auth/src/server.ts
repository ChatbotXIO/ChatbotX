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
import { createId, getPublicOriginFromRequest } from "@chatbotx.io/utils"
import { APIError, betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { anonymous, magicLink, oneTimeToken } from "better-auth/plugins"
import { PHASE_PRODUCTION_BUILD } from "next/constants"
import { env } from "./keys"
import { getTenantId } from "./tenant-context"

const getPlatformSettings = async (request: Request) => {
  const domain = request.headers.get("x-domain") ?? ""
  return await resolvePlatformSettingsByDomain(domain)
}

type AdapterFactory = ReturnType<typeof drizzleAdapter>
type AuthAdapter = ReturnType<AdapterFactory>
type WhereClause = Parameters<AuthAdapter["findOne"]>[0]["where"][number]

/**
 * Wrap the drizzle adapter so white-label isolation holds at the data layer:
 * every `User` lookup *by email* and every `User` insert is constrained to the
 * current tenant (`getTenantId()` — `null` = platform). Lookups by id/token are
 * untouched, so sessions stay tenant-neutral. This is what lets the same email
 * exist as fully separate accounts across tenants.
 */
function createTenantScopedAdapter(base: AdapterFactory): AdapterFactory {
  const scopeUserEmailWhere = (
    model: string,
    where: WhereClause[] | undefined,
  ): WhereClause[] | undefined => {
    if (model !== "user" || !where) {
      return where
    }
    const filtersByEmail = where.some((clause) => clause.field === "email")
    const alreadyScoped = where.some((clause) => clause.field === "resellerId")
    if (!filtersByEmail || alreadyScoped) {
      return where
    }
    return [...where, { field: "resellerId", value: getTenantId() }]
  }

  return (options) => {
    const adapter = base(options)
    return {
      ...adapter,
      findOne: <T>(data: Parameters<AuthAdapter["findOne"]>[0]) =>
        adapter.findOne<T>({
          ...data,
          where: scopeUserEmailWhere(data.model, data.where) ?? data.where,
        }),
      findMany: <T>(data: Parameters<AuthAdapter["findMany"]>[0]) =>
        adapter.findMany<T>({
          ...data,
          where: scopeUserEmailWhere(data.model, data.where),
        }),
      count: (data: Parameters<AuthAdapter["count"]>[0]) =>
        adapter.count({
          ...data,
          where: scopeUserEmailWhere(data.model, data.where),
        }),
      create: <T extends Record<string, unknown>, R = T>(data: {
        model: string
        data: Omit<T, "id">
        select?: string[]
        forceAllowId?: boolean
      }) =>
        adapter.create<T, R>(
          data.model === "user"
            ? { ...data, data: { ...data.data, resellerId: getTenantId() } }
            : data,
        ),
    }
  }
}

export type AuthConfig = Record<string, unknown>

export function createAuth(_config: AuthConfig) {
  return betterAuth({
    database: createTenantScopedAdapter(
      drizzleAdapter(db, {
        provider: "pg",
        schema: {
          user: userModel,
          verification: verificationModel,
          session: sessionModel,
          account: accountModel,
        },
      }),
    ),
    // `resellerId` is the white-label tenant key. Declared so better-auth maps it
    // to the column and the adapter wrapper can stamp it on user inserts. Never
    // accepted from client input and never returned — the wrapper sets it from
    // the bound tenant. See tenant-context.ts.
    user: {
      additionalFields: {
        resellerId: {
          type: "string",
          required: false,
          input: false,
          returned: false,
        },
      },
    },
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

        const resetPasswordUrl = new URL(url)
        resetPasswordUrl.hostname = new URL(originUrl).hostname

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
          resetPasswordUrl: resetPasswordUrl.toString(),
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

        const verificationUrl = new URL(url)
        verificationUrl.hostname = new URL(originUrl).hostname

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
          verificationUrl: verificationUrl.toString(),
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

          const magicUrl = new URL(url)
          magicUrl.hostname = new URL(originUrl).hostname

          const {
            name: brandName,
            logoLightUrl,
            magicLinkEmailTemplate,
          } = platformInfo

          const tenantId = getTenantId()
          const user = await db.query.userModel.findFirst({
            where: {
              email,
              resellerId: tenantId === null ? { isNull: true } : tenantId,
            },
          })
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
            magicUrl: magicUrl.toString(),
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
    trustedOrigins: async () => {
      const domains = await db.query.customDomainModel.findMany({
        where: {
          status: "active",
        },
        columns: {
          domain: true,
        },
      })

      return [
        env.NEXT_PUBLIC_BUILDER_URL,
        ...domains.map((d) => `https://${d.domain}`),
      ]
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
