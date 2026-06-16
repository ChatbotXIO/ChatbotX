import {
  customDomainService,
  resolveTenantSettingsByDomain,
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
import { env, getBrokerUrl } from "./keys"
import {
  getTenantId,
  isStrictTenantScope,
  resolveTenantOwnerId,
} from "./tenant-context"

const getTenantSettings = async (request: Request) => {
  const domain = request.headers.get("x-domain") ?? ""
  return await resolveTenantSettingsByDomain(domain)
}

type AdapterFactory = ReturnType<typeof drizzleAdapter>
type AuthAdapter = ReturnType<AdapterFactory>
type WhereClause = Parameters<AuthAdapter["findOne"]>[0]["where"][number]

/**
 * Wrap the drizzle adapter so white-label isolation holds at the data layer:
 * every `User` lookup *by email* and every `User` insert is constrained to the
 * current tenant (`getTenantId()` — `ROOT_TENANT_ID` = platform). Lookups by
 * id/token are untouched, so sessions stay tenant-neutral. This is what lets the
 * same email exist as fully separate accounts across tenants.
 */
export function createTenantScopedAdapter(
  base: AdapterFactory,
): AdapterFactory {
  // Constrain a lookup to the current tenant so white-label accounts stay
  // isolated:
  //   • `user` lookups *by email* — the same email is a separate account per
  //     tenant.
  //   • `account` lookups *by social identity* (`accountId`) — the same provider
  //     identity links to a separate account row per tenant, so social sign-in on
  //     a reseller domain never resolves the owner's root-tenant account.
  // Lookups by id/token/userId are left untouched, so sessions and a user's own
  // account list stay tenant-neutral.
  const scopeByTenant = (
    model: string,
    where: WhereClause[] | undefined,
  ): WhereClause[] | undefined => {
    if (!where || where.some((clause) => clause.field === "tenantId")) {
      return where
    }
    const scopesUserByEmail =
      model === "user" && where.some((clause) => clause.field === "email")
    const scopesAccountByIdentity =
      model === "account" &&
      where.some((clause) => clause.field === "accountId")
    if (!(scopesUserByEmail || scopesAccountByIdentity)) {
      return where
    }
    return [...where, { field: "tenantId", value: getTenantId() }]
  }

  // Apply the tenant overrides to an adapter. Recursive via `transaction`: when
  // better-auth runs a write inside `runWithTransaction`, it resolves the active
  // adapter from the `trx` this callback receives (`getCurrentAdapter`), NOT the
  // outer wrapped adapter. With transactions disabled the base adapter hands back
  // *itself* as `trx`, so without re-wrapping it the user/account insert would run
  // unwrapped and skip the `tenantId` stamp — leaving the column at its root-tenant
  // default. Re-wrapping `trx` keeps scoping and stamping intact inside writes.
  const wrapAdapter = (adapter: AuthAdapter): AuthAdapter => {
    const baseTransaction = adapter.transaction
    const wrappedTransaction =
      typeof baseTransaction === "function"
        ? ((<R>(callback: (trx: AuthAdapter) => Promise<R>) =>
            baseTransaction((trx) =>
              callback(wrapAdapter(trx as AuthAdapter)),
            )) as AuthAdapter["transaction"])
        : baseTransaction
    return {
      ...adapter,
      transaction: wrappedTransaction,
      findOne: async <T>(data: Parameters<AuthAdapter["findOne"]>[0]) => {
        const result = await adapter.findOne<T>({
          ...data,
          where: scopeByTenant(data.model, data.where) ?? data.where,
        })
        if (result || data.model !== "user" || !data.where) {
          return result
        }
        // Reseller-owner fallback: on the reseller's own custom domain the bound
        // tenant is their reseller `Tenant`, but the reseller's account lives in
        // the root tenant (they signed up on the main site) and so is missed by
        // the scoped lookup above. Resolve the bound tenant's owner and retry by
        // primary key. `Tenant.ownerId` resolves only this tenant's owner — never
        // another tenant's user — and `id` is unique, so the match is exact.
        // Sub-account lookups are tried first, so they keep priority.
        //
        // Suppressed under `strictScope` (the OAuth social-callback path): a social
        // sign-in on a reseller domain must always stay tenant-scoped, so even the
        // owner's email resolves to a tenant-scoped user (created when absent)
        // rather than matching their root-tenant platform account.
        const filtersByEmail = data.where.some(
          (clause) => clause.field === "email",
        )
        if (!filtersByEmail || isStrictTenantScope()) {
          return result
        }
        const tenantId = getTenantId()
        const ownerId = await resolveTenantOwnerId(tenantId)
        if (ownerId) {
          const ownerWhere: WhereClause[] = [
            ...data.where.filter((clause) => clause.field !== "tenantId"),
            { field: "id", value: ownerId },
          ]
          return adapter.findOne<T>({ ...data, where: ownerWhere })
        }
        return result
      },
      findMany: <T>(data: Parameters<AuthAdapter["findMany"]>[0]) =>
        adapter.findMany<T>({
          ...data,
          where: scopeByTenant(data.model, data.where),
        }),
      count: (data: Parameters<AuthAdapter["count"]>[0]) =>
        adapter.count({
          ...data,
          where: scopeByTenant(data.model, data.where),
        }),
      // Stamp the bound tenant on every `user` and `account` insert so a row's
      // ownership matches the tenant it was created under. `tenantId` is declared
      // as a (non-input) field on both models so better-auth keeps the value.
      create: <T extends Record<string, unknown>, R = T>(data: {
        model: string
        data: Omit<T, "id">
        select?: string[]
        forceAllowId?: boolean
      }) =>
        adapter.create<T, R>(
          data.model === "user" || data.model === "account"
            ? { ...data, data: { ...data.data, tenantId: getTenantId() } }
            : data,
        ),
    }
  }

  return (options) => wrapAdapter(base(options))
}

/** A social provider better-auth can sign users in with (white-label per tenant). */
export const SOCIAL_PROVIDERS = ["google", "facebook"] as const
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number]

/**
 * A fixed OAuth app (client id + secret) for one provider on a single auth
 * instance. Resolved per tenant ahead of building the instance — better-auth
 * freezes social-provider config at init (the `socialProviders` thunk runs once,
 * with no request/tenant context), so the only way to give each white-label
 * tenant its own provider app is to build a separate auth instance per
 * credential. See `apps/builder` `auth-instances.ts`.
 */
export type SocialAuthCredential = {
  clientId: string
  clientSecret: string
}

export type AuthConfig = {
  /**
   * The per-provider OAuth apps this instance signs in with. A provider is
   * enabled only when its credential is present; omit/`null` to disable it.
   */
  socialCredentials?: Partial<
    Record<SocialProvider, SocialAuthCredential | null>
  >
}

/**
 * Build the `socialProviders` config from the resolved per-provider credentials.
 * Returns `undefined` (all social disabled) during the production build phase —
 * the thunk runs without request context then — or when nothing resolved.
 */
function buildSocialProviders(
  socialCredentials: AuthConfig["socialCredentials"],
) {
  if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD || !socialCredentials) {
    return
  }

  const providers: Partial<
    Record<
      SocialProvider,
      { enabled: true; redirectURI: string } & SocialAuthCredential
    >
  > = {}
  const brokerOrigin = new URL(getBrokerUrl()).origin
  for (const provider of SOCIAL_PROVIDERS) {
    const credential = socialCredentials[provider]
    if (credential?.clientId && credential.clientSecret) {
      providers[provider] = {
        enabled: true,
        clientId: credential.clientId,
        clientSecret: credential.clientSecret,
        // Pin the redirect_uri to the broker host. Without this, better-auth
        // infers it from the request origin (the reseller domain), which is NOT
        // registered with the provider. The broker is the single registered URI;
        // the callback relays back to the reseller domain afterwards.
        redirectURI: new URL(
          `/api/auth/callback/${provider}`,
          brokerOrigin,
        ).toString(),
      }
    }
  }

  return Object.keys(providers).length > 0 ? providers : undefined
}

export function createAuth(config: AuthConfig) {
  const socialProviders = buildSocialProviders(config.socialCredentials)

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
    // `tenantId` is the white-label tenant key. Declared on both `user` and
    // `account` so better-auth maps it to the column and keeps the value the
    // adapter wrapper stamps on insert (an undeclared field is dropped by
    // `transformInput`, leaving the column to fall back to its root-tenant
    // default). Never accepted from client input and never returned — the wrapper
    // sets it from the bound tenant. See tenant-context.ts.
    user: {
      additionalFields: {
        tenantId: {
          type: "string",
          required: false,
          input: false,
          returned: false,
        },
      },
    },
    account: {
      // The OAuth flow lands on the fixed broker host and is then relayed back to
      // the originating branded host (see route.ts). Because the authorize-time
      // `state` cookie is host-scoped, it isn't guaranteed to be present on the
      // broker leg of that cross-host hand-off. CSRF integrity instead rests on
      // the `state` value persisted in the `Verification` table (validated by
      // better-auth's `parseGenericState`) plus the origin allowlist in
      // `oauth-referer.ts`, so the cookie check is safe to skip here.
      skipStateCookieCheck: true,
      additionalFields: {
        tenantId: {
          type: "string",
          required: false,
          input: false,
          returned: false,
        },
      },
    },
    socialProviders,
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
          getTenantSettings(request),
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
          getTenantSettings(request),
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
            getTenantSettings(request as unknown as Request),
          ])

          const magicUrl = new URL(url)
          magicUrl.hostname = new URL(originUrl).hostname

          const {
            name: brandName,
            logoLightUrl,
            magicLinkEmailTemplate,
          } = platformInfo

          const tenantId = getTenantId()
          // Match the tenant's users by email, plus the reseller-owner on their
          // own custom domain (the owner's account lives in the root tenant).
          // Mirrors the findOne reseller-owner fallback above.
          //
          // NOTE: this only gates whether a link is *sent*. The token better-auth
          // stores in `Verification` carries no tenant, so a token issued in one
          // tenant and replayed (with the host rewritten) against another tenant's
          // domain would verify under that other tenant. Closing this fully needs a
          // tenant-scoped verification lookup, which better-auth doesn't expose as a
          // hook today. Practical exploit requires intercepting the victim's email.
          // See docs/tenancy.md → "Residual security considerations".
          const ownerId = await resolveTenantOwnerId(tenantId)
          const user = await db.query.userModel.findFirst({
            where: {
              email,
              OR: [{ tenantId }, ...(ownerId ? [{ id: ownerId }] : [])],
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
      // better-auth calls this on every request, so read the active domains from
      // the short-TTL cache instead of scanning `CustomDomain` each time.
      const domains = await customDomainService.listActiveDomains()

      // Broker + builder + every active custom domain. The broker is where
      // callbacks land; the builder and custom domains are valid relay targets
      // (where sign-in is initiated and the session cookie is written).
      return Array.from(
        new Set([
          getBrokerUrl(),
          env.NEXT_PUBLIC_BUILDER_URL,
          ...domains.map((domain) => `https://${domain}`),
        ]),
      )
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
