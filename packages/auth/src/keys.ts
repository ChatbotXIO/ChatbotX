import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

const trailingSlashPattern = /\/$/

export const keys = () =>
  createEnv({
    server: {
      NEXT_PUBLIC_BUILDER_URL: z.url(),
      // The dedicated, brand-neutral broker host — the canonical provider-facing
      // origin for both OAuth redirect_uris (Google, Facebook, …) and host-validated
      // webhooks (WhatsApp/Meta, TikTok). It is registered as the single redirect_uri
      // with every provider; all white-label callbacks land here, then relay back to
      // the originating domain. Optional: falls back to NEXT_PUBLIC_BUILDER_URL so
      // single-domain deploys keep working.
      NEXT_PUBLIC_BROKER_URL: z.url().optional(),
      // Canonical protected resource URL for ChatbotX's MCP server. Optional:
      // falls back to the builder origin's `/mcp` path.
      MCP_PUBLIC_URL: z.url().optional(),
      AUTH_DISABLE_SIGNUP: z.stringbool().default(false),
      AUTH_OAUTH_ENABLED: z.stringbool().default(false),
      AUTH_OAUTH_CLIENT_ID: z.string().optional(),
      AUTH_OAUTH_CLIENT_SECRET: z.string().optional(),
      AUTH_OAUTH_DISCOVERY_URL: z.url().optional(),
      AUTH_OAUTH_AUTH_URL: z.url().optional(),
      AUTH_OAUTH_TOKEN_URL: z.url().optional(),
      AUTH_OAUTH_USERINFO_URL: z.url().optional(),
      AUTH_OAUTH_SCOPES: z.string().default("openid,email,profile"),
      AUTH_OAUTH_TRUST_EMAIL: z.stringbool().default(false),
      BETTER_AUTH_SECRET: z.string(),
    },
    runtimeEnv: process.env,
    emptyStringAsUndefined: true,
    skipValidation: process.env.SKIP_ENV_CHECK === "true",
    // Cross-field: a half-configured provider must fail the deploy loudly
    // instead of silently disabling SSO at request time (see
    // `resolveGenericOAuthConfig`'s fallback, kept only for `SKIP_ENV_CHECK`
    // builds where this validation never runs).
    createFinalSchema: (shape) =>
      z.object(shape).superRefine((parsedEnv, ctx) => {
        if (!parsedEnv.AUTH_OAUTH_ENABLED) {
          return
        }
        if (
          !(
            parsedEnv.AUTH_OAUTH_CLIENT_ID && parsedEnv.AUTH_OAUTH_CLIENT_SECRET
          )
        ) {
          ctx.addIssue({
            code: "custom",
            path: ["AUTH_OAUTH_CLIENT_ID"],
            message:
              "AUTH_OAUTH_CLIENT_ID and AUTH_OAUTH_CLIENT_SECRET are required when AUTH_OAUTH_ENABLED is true",
          })
        }
        const hasDiscovery = Boolean(parsedEnv.AUTH_OAUTH_DISCOVERY_URL)
        const hasAuthorizationPair = Boolean(
          parsedEnv.AUTH_OAUTH_AUTH_URL && parsedEnv.AUTH_OAUTH_TOKEN_URL,
        )
        if (!(hasDiscovery || hasAuthorizationPair)) {
          ctx.addIssue({
            code: "custom",
            path: ["AUTH_OAUTH_DISCOVERY_URL"],
            message:
              "AUTH_OAUTH_ENABLED requires AUTH_OAUTH_DISCOVERY_URL, or both AUTH_OAUTH_AUTH_URL and AUTH_OAUTH_TOKEN_URL",
          })
        }
      }),
  })

const rawEnv = keys()

// `z.stringbool()` already parses the field when validation runs; this only
// has work to do when `SKIP_ENV_CHECK` bypassed that and left a raw string.
// Reuses the same accepted-values set (`"1"`/`"yes"`/`"true"`, case-insensitive)
// instead of a narrower hand-rolled check.
const normalizeBoolean = (value: unknown): boolean =>
  typeof value === "boolean" ? value : z.stringbool().catch(false).parse(value)

const normalizeScopeList = (value: unknown): string =>
  typeof value === "string" && value.length > 0 ? value : "openid,email,profile"

// `SKIP_ENV_CHECK` bypasses Zod during build, so normalize the fields that
// production code reads directly to preserve their declared defaults.
export const env = {
  ...rawEnv,
  AUTH_DISABLE_SIGNUP: normalizeBoolean(rawEnv.AUTH_DISABLE_SIGNUP),
  AUTH_OAUTH_ENABLED: normalizeBoolean(rawEnv.AUTH_OAUTH_ENABLED),
  AUTH_OAUTH_SCOPES: normalizeScopeList(rawEnv.AUTH_OAUTH_SCOPES),
  AUTH_OAUTH_TRUST_EMAIL: normalizeBoolean(rawEnv.AUTH_OAUTH_TRUST_EMAIL),
}

/**
 * The OAuth broker origin — the single host registered with every provider as
 * the redirect_uri. Defaults to the builder URL when no dedicated broker is
 * configured, so existing single-domain deployments are unaffected.
 */
export const getBrokerUrl = (): string =>
  env.NEXT_PUBLIC_BROKER_URL ?? env.NEXT_PUBLIC_BUILDER_URL

export const getMcpResourceUrl = (): string =>
  (
    env.MCP_PUBLIC_URL ??
    new URL("/mcp", env.NEXT_PUBLIC_BUILDER_URL).toString()
  ).replace(trailingSlashPattern, "")

/** Whether self-service account creation is disabled. */
export const isSignUpDisabled = (): boolean => env.AUTH_DISABLE_SIGNUP
