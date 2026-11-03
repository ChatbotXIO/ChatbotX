import { mobileRefreshTokenService, userService } from "@chatbotx.io/business"
import { createId } from "@chatbotx.io/utils"
import type { BetterAuthPlugin } from "better-auth"
import {
  APIError,
  createAuthEndpoint,
  createAuthMiddleware,
  getSessionFromCtx,
  isAPIError,
} from "better-auth/api"
import { deleteSessionCookie } from "better-auth/cookies"
import { signJWT } from "better-auth/plugins/jwt"
import { z } from "zod"
import {
  getBuilderOrigin,
  getMobileApiAudience,
  getMobileAppSchemes,
} from "./keys"
import { logger } from "./logger"
import {
  createExchangeCode,
  hashExchangeCode,
  verifyPkceChallenge,
} from "./mobile-exchange-code"

export const MOBILE_ACCESS_TOKEN_TTL_SECONDS = 10 * 60
export const MOBILE_EXCHANGE_CODE_TTL_MS = 60 * 1000

const MOBILE_CODE_IDENTIFIER_PREFIX = "mobile-auth-code:"
const MOBILE_TOKEN_PATH = "/mobile/token"
const DEVICE_ID_MAX_LENGTH = 128
const DEVICE_ID_PATTERN = /^[\w.:-]+$/
const PKCE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]+$/
// Same rule better-auth applies to `/sign-in/*`: 3 attempts per 10 seconds per IP.
const SIGN_IN_RATE_LIMIT = { window: 10, max: 3 } as const

const deviceIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(DEVICE_ID_MAX_LENGTH)
  .regex(DEVICE_ID_PATTERN)

const tokenRequestSchema = z.discriminatedUnion("grantType", [
  z.object({
    grantType: z.literal("password"),
    email: z.string().min(1),
    password: z.string().min(1),
    deviceId: deviceIdSchema.optional(),
  }),
  z.object({
    grantType: z.literal("exchange_code"),
    code: z.string().min(1),
    codeVerifier: z
      .string()
      .min(43)
      .max(128)
      .regex(/^[A-Za-z0-9._~-]+$/),
    deviceId: deviceIdSchema.optional(),
  }),
  z.object({
    grantType: z.literal("refresh_token"),
    refreshToken: z.string().min(1),
  }),
])

type ExchangeCodeRecord = {
  userId: string
  deviceId: string | null
  codeChallenge: string
}

type MobileUser = {
  id: string
  mustChangePassword?: boolean | null
}

type AuthContext = Parameters<typeof signJWT>[0]

export type MobileTokenResponse = {
  tokenType: "Bearer"
  accessToken: string
  /** Seconds until `accessToken` expires. */
  expiresIn: number
  /** Epoch milliseconds at which `accessToken` expires. */
  expiresAt: number
  refreshToken: string
  /** Epoch milliseconds at which `refreshToken` expires. */
  refreshTokenExpiresAt: number
  deviceId: string
  mustChangePassword: boolean
}

type JwtPluginOptions = { jwt?: Record<string, unknown> }

const unauthorized = (code: string, message: string) =>
  APIError.from("UNAUTHORIZED", { code, message })

const mintAccessToken = async (
  ctx: AuthContext,
  user: MobileUser,
  deviceId: string,
): Promise<{ token: string; expiresAt: number }> => {
  // Reuse the jwt() plugin instance (same JWKS signing key, same issuer) but
  // override audience and expiry for this one token — the global jwt() options
  // that MCP depends on are never touched.
  const jwtOptions = (ctx.context.getPlugin?.("jwt")?.options ??
    {}) as JwtPluginOptions
  const issuedAt = Math.floor(Date.now() / 1000)
  const expiresAtSeconds = issuedAt + MOBILE_ACCESS_TOKEN_TTL_SECONDS
  const token = await signJWT(ctx, {
    options: {
      ...jwtOptions,
      jwt: {
        ...jwtOptions.jwt,
        issuer: getBuilderOrigin(),
        audience: getMobileApiAudience(),
      },
    },
    payload: {
      sub: user.id,
      iat: issuedAt,
      exp: expiresAtSeconds,
      jti: createId(),
      deviceId,
      mustChangePassword: user.mustChangePassword === true,
    },
  })
  return { token, expiresAt: expiresAtSeconds * 1000 }
}

const buildTokenResponse = async (props: {
  ctx: AuthContext
  user: MobileUser
  deviceId: string
  refreshToken: { token: string; expiresAt: Date }
}): Promise<MobileTokenResponse> => {
  const { ctx, user, deviceId, refreshToken } = props
  const access = await mintAccessToken(ctx, user, deviceId)
  return {
    tokenType: "Bearer",
    accessToken: access.token,
    expiresIn: MOBILE_ACCESS_TOKEN_TTL_SECONDS,
    expiresAt: access.expiresAt,
    refreshToken: refreshToken.token,
    refreshTokenExpiresAt: refreshToken.expiresAt.getTime(),
    deviceId,
    mustChangePassword: user.mustChangePassword === true,
  }
}

const setNoStore = (ctx: {
  setHeader: (name: string, value: string) => void
}) => {
  ctx.setHeader("Cache-Control", "no-store")
  ctx.setHeader("Pragma", "no-cache")
}

/**
 * Credential check for the `password` grant. Mirrors `/sign-in/email` minus
 * the session: same lookup (tenant-scoped through the adapter wrapper), same
 * dummy-hash on a miss (constant-ish timing), same email-verification gate.
 */
const authenticateWithPassword = async (
  ctx: Parameters<typeof mintAccessToken>[0],
  input: { email: string; password: string },
): Promise<MobileUser> => {
  const email = input.email.trim().toLowerCase()
  if (!z.email().safeParse(email).success) {
    throw APIError.from("BAD_REQUEST", {
      code: "INVALID_EMAIL",
      message: "Invalid email",
    })
  }
  if (input.password.length > ctx.context.password.config.maxPasswordLength) {
    throw APIError.from("BAD_REQUEST", {
      code: "PASSWORD_TOO_LONG",
      message: "Password too long",
    })
  }

  const record = await ctx.context.internalAdapter.findUserByEmail(email, {
    includeAccounts: true,
  })
  const credential = record?.accounts.find(
    (account) =>
      account.providerId === "credential" &&
      account.accountId === record.user.id,
  )
  if (!(record && credential?.password)) {
    await ctx.context.password.hash(input.password)
    throw unauthorized("INVALID_EMAIL_OR_PASSWORD", "Invalid email or password")
  }
  const passwordMatches = await ctx.context.password.verify({
    hash: credential.password,
    password: input.password,
  })
  if (!passwordMatches) {
    throw unauthorized("INVALID_EMAIL_OR_PASSWORD", "Invalid email or password")
  }
  if (
    ctx.context.options.emailAndPassword?.requireEmailVerification &&
    !record.user.emailVerified
  ) {
    throw APIError.from("FORBIDDEN", {
      code: "EMAIL_NOT_VERIFIED",
      message: "Email not verified",
    })
  }
  return record.user
}

/** Atomically consumes a one-time exchange code (single use even under races). */
const consumeExchangeCode = async (
  ctx: AuthContext,
  code: string,
): Promise<ExchangeCodeRecord | null> => {
  const identifier = `${MOBILE_CODE_IDENTIFIER_PREFIX}${await hashExchangeCode(code)}`
  const row =
    await ctx.context.internalAdapter.consumeVerificationValue(identifier)
  if (!row) {
    return null
  }
  try {
    const parsed = JSON.parse(row.value) as Partial<ExchangeCodeRecord>
    if (
      typeof parsed.userId !== "string" ||
      typeof parsed.codeChallenge !== "string"
    ) {
      return null
    }
    return {
      userId: parsed.userId,
      deviceId: typeof parsed.deviceId === "string" ? parsed.deviceId : null,
      codeChallenge: parsed.codeChallenge,
    }
  } catch {
    return null
  }
}

const storeExchangeCode = async (
  ctx: AuthContext,
  record: ExchangeCodeRecord,
) => {
  const code = createExchangeCode()
  await ctx.context.internalAdapter.createVerificationValue({
    identifier: `${MOBILE_CODE_IDENTIFIER_PREFIX}${await hashExchangeCode(code)}`,
    value: JSON.stringify(record),
    expiresAt: new Date(Date.now() + MOBILE_EXCHANGE_CODE_TTL_MS),
  })
  return code
}

const parseRedirectUri = (value: string | undefined): URL | null => {
  if (!(value && URL.canParse(value))) {
    return null
  }
  const url = new URL(value)
  const scheme = url.protocol.replace(":", "").toLowerCase()
  // Custom schemes only — never an http(s) origin, which could hand the code
  // to a web page.
  if (scheme === "http" || scheme === "https") {
    return null
  }
  return getMobileAppSchemes().includes(scheme) ? url : null
}

const redirectToApp = (
  target: URL,
  params: Record<string, string | undefined>,
): string => {
  const url = new URL(target)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, value)
    }
  }
  return url.toString()
}

/**
 * better-auth plugin: JWT grants for the native mobile app.
 *
 * - `POST /mobile/token`  grants `password`, `exchange_code`, `refresh_token`
 * - `GET  /mobile/callback` end of the browser social-login flow; mints a
 *   one-time code and redirects to `<scheme>://auth-callback?code=`
 * - `POST /mobile/revoke` logout (revokes a refresh-token family)
 * - server-only `mobileChangePassword`, used by `POST /v1/me/password`
 *
 * No session is ever created: access tokens are short-lived JWTs signed by the
 * existing `jwt()` plugin (audience `<builder>/api`), and refresh tokens are
 * opaque, hashed at rest, rotating (reuse revokes the family).
 */
export const mobileAuth = () =>
  ({
    id: "mobile-auth",
    endpoints: {
      mobileToken: createAuthEndpoint(
        MOBILE_TOKEN_PATH,
        { method: "POST", body: tokenRequestSchema },
        async (ctx) => {
          setNoStore(ctx)
          const body = ctx.body

          if (body.grantType === "refresh_token") {
            const rotation = await mobileRefreshTokenService.rotate({
              token: body.refreshToken,
            })
            if (rotation.kind === "reused") {
              logger.warn(
                { userId: rotation.userId, deviceId: rotation.deviceId },
                "Mobile refresh token reuse detected; token family revoked",
              )
              throw unauthorized(
                "REFRESH_TOKEN_REUSED",
                "Refresh token was already used",
              )
            }
            if (rotation.kind === "invalid") {
              throw unauthorized(
                "INVALID_REFRESH_TOKEN",
                "Invalid or expired refresh token",
              )
            }
            const user = await ctx.context.internalAdapter.findUserById(
              rotation.userId,
            )
            if (!user) {
              await mobileRefreshTokenService.revokeAllForUser({
                userId: rotation.userId,
              })
              throw unauthorized(
                "INVALID_REFRESH_TOKEN",
                "Invalid or expired refresh token",
              )
            }
            return ctx.json(
              await buildTokenResponse({
                ctx,
                user,
                deviceId: rotation.deviceId,
                refreshToken: rotation.refreshToken,
              }),
            )
          }

          if (body.grantType === "exchange_code") {
            const record = await consumeExchangeCode(ctx, body.code)
            if (!record) {
              throw unauthorized(
                "INVALID_EXCHANGE_CODE",
                "Invalid or expired code",
              )
            }
            if (
              !(await verifyPkceChallenge(
                body.codeVerifier,
                record.codeChallenge,
              ))
            ) {
              throw unauthorized(
                "INVALID_CODE_VERIFIER",
                "Code verifier does not match",
              )
            }
            const user = await ctx.context.internalAdapter.findUserById(
              record.userId,
            )
            if (!user) {
              throw unauthorized(
                "INVALID_EXCHANGE_CODE",
                "Invalid or expired code",
              )
            }
            const deviceId = body.deviceId ?? record.deviceId ?? createId()
            const refreshToken = await mobileRefreshTokenService.issue({
              userId: user.id,
              deviceId,
            })
            return ctx.json(
              await buildTokenResponse({ ctx, user, deviceId, refreshToken }),
            )
          }

          const user = await authenticateWithPassword(ctx, body)
          const deviceId = body.deviceId ?? createId()
          const refreshToken = await mobileRefreshTokenService.issue({
            userId: user.id,
            deviceId,
          })
          return ctx.json(
            await buildTokenResponse({ ctx, user, deviceId, refreshToken }),
          )
        },
      ),

      mobileCallback: createAuthEndpoint(
        "/mobile/callback",
        {
          method: "GET",
          query: z.object({
            redirect_uri: z.string().optional(),
            code_challenge: z.string().length(43).regex(PKCE_CHALLENGE_PATTERN),
            device_id: deviceIdSchema.optional(),
            state: z.string().max(512).optional(),
          }),
        },
        async (ctx) => {
          const target = parseRedirectUri(ctx.query.redirect_uri)
          if (!target) {
            throw APIError.from("BAD_REQUEST", {
              code: "INVALID_REDIRECT_URI",
              message: "redirect_uri is not an allowed app scheme",
            })
          }
          const session = await getSessionFromCtx(ctx)
          if (!session) {
            throw ctx.redirect(
              redirectToApp(target, {
                error: "access_denied",
                state: ctx.query.state,
              }),
            )
          }
          const code = await storeExchangeCode(ctx, {
            userId: session.user.id,
            deviceId: ctx.query.device_id ?? null,
            codeChallenge: ctx.query.code_challenge,
          })
          // The social callback minted a browser session as a side effect; the
          // app only ever holds JWT + refresh token, so drop it again.
          await ctx.context.internalAdapter.deleteSession(session.session.token)
          deleteSessionCookie(ctx)
          throw ctx.redirect(
            redirectToApp(target, { code, state: ctx.query.state }),
          )
        },
      ),

      mobileRevoke: createAuthEndpoint(
        "/mobile/revoke",
        {
          method: "POST",
          body: z.object({ refreshToken: z.string().min(1) }),
        },
        async (ctx) => {
          setNoStore(ctx)
          await mobileRefreshTokenService.revokeByToken({
            token: ctx.body.refreshToken,
          })
          return ctx.json({ success: true as const })
        },
      ),

      // Server-only (no HTTP path): reachable solely through
      // `auth.api.mobileChangePassword`, after the caller authenticated the JWT.
      mobileChangePassword: createAuthEndpoint.serverOnly(
        {
          method: "POST",
          body: z.object({
            userId: z.string().min(1),
            currentPassword: z.string().min(1),
            newPassword: z.string().min(1),
            deviceId: deviceIdSchema,
          }),
        },
        async (ctx) => {
          const { userId, currentPassword, newPassword, deviceId } = ctx.body
          const { password, internalAdapter } = ctx.context
          if (
            newPassword.length < password.config.minPasswordLength ||
            newPassword.length > password.config.maxPasswordLength ||
            currentPassword.length > password.config.maxPasswordLength
          ) {
            throw APIError.from("BAD_REQUEST", {
              code: "PASSWORD_LENGTH_INVALID",
              message: "Password length is not allowed",
            })
          }
          const credential = await internalAdapter.findCredentialAccount(userId)
          const matches =
            credential?.password &&
            (await password.verify({
              hash: credential.password,
              password: currentPassword,
            }))
          if (!matches) {
            throw APIError.from("BAD_REQUEST", {
              code: "INVALID_PASSWORD",
              message: "Invalid password",
            })
          }
          if (newPassword === currentPassword) {
            throw APIError.from("BAD_REQUEST", {
              code: "PASSWORD_UNCHANGED",
              message: "New password must be different from the current one",
            })
          }
          await internalAdapter.updatePassword(
            userId,
            await password.hash(newPassword),
          )
          await internalAdapter.deleteUserSessions(userId)
          await userService.clearMustChangePassword(userId)
          // Every device signs in again, except this one, which gets a fresh
          // token family so the forced-change flow does not end in a logout.
          await mobileRefreshTokenService.revokeAllForUser({ userId })
          const user = await internalAdapter.findUserById(userId)
          if (!user) {
            throw unauthorized("INVALID_USER", "User not found")
          }
          const refreshToken = await mobileRefreshTokenService.issue({
            userId,
            deviceId,
          })
          return ctx.json(
            await buildTokenResponse({
              ctx,
              user: { ...user, mustChangePassword: false },
              deviceId,
              refreshToken,
            }),
          )
        },
      ),
    },
    hooks: {
      after: [
        {
          matcher: (context) =>
            context.path === "/change-password" ||
            context.path === "/set-password",
          handler: createAuthMiddleware(async (ctx) => {
            if (isAPIError(ctx.context.returned)) {
              return
            }
            const userId = ctx.context.session?.user.id
            if (userId) {
              await mobileRefreshTokenService.revokeAllForUser({ userId })
            }
          }),
        },
      ],
    },
    rateLimit: [
      {
        pathMatcher: (path: string) => path === MOBILE_TOKEN_PATH,
        ...SIGN_IN_RATE_LIMIT,
      },
    ],
  }) satisfies BetterAuthPlugin
