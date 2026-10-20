import { parseEnvBool } from "@chatbotx.io/utils"
import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

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
      AUTH_DISABLE_SIGNUP: z.stringbool().default(false),
      AUTH_OAUTH_ENABLED: z.stringbool().default(false),
      AUTH_OAUTH_CLIENT_ID: z.string().optional(),
      AUTH_OAUTH_CLIENT_SECRET: z.string().optional(),
      AUTH_OAUTH_DISCOVERY_URL: z.url().optional(),
      AUTH_OAUTH_AUTH_URL: z.url().optional(),
      AUTH_OAUTH_TOKEN_URL: z.url().optional(),
      AUTH_OAUTH_USERINFO_URL: z.url().optional(),
      AUTH_OAUTH_SCOPES: z.string().optional().default("openid,email,profile"),
      AUTH_OAUTH_TRUST_EMAIL: z.stringbool().default(false),
      BETTER_AUTH_SECRET: z.string(),
    },
    runtimeEnv: process.env,
    emptyStringAsUndefined: true,
    skipValidation: process.env.SKIP_ENV_CHECK === "true",
  })

export const env = keys()

/**
 * The OAuth broker origin — the single host registered with every provider as
 * the redirect_uri. Defaults to the builder URL when no dedicated broker is
 * configured, so existing single-domain deployments are unaffected.
 */
export const getBrokerUrl = (): string =>
  env.NEXT_PUBLIC_BROKER_URL ?? env.NEXT_PUBLIC_BUILDER_URL

/** Whether self-service account creation is disabled. */
export const isSignUpDisabled = (): boolean =>
  parseEnvBool(env.AUTH_DISABLE_SIGNUP)
