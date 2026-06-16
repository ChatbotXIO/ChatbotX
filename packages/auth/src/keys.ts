import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const keys = () =>
  createEnv({
    server: {
      NEXT_PUBLIC_BUILDER_URL: z.url(),
      // The dedicated, brand-neutral OAuth broker host registered as the single
      // redirect_uri with every provider (Google, Facebook, …). All white-label
      // callbacks land here, then relay back to the originating domain. Optional:
      // falls back to NEXT_PUBLIC_BUILDER_URL so single-domain deploys keep working.
      NEXT_PUBLIC_OAUTH_BROKER_URL: z.url().optional(),
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
  env.NEXT_PUBLIC_OAUTH_BROKER_URL ?? env.NEXT_PUBLIC_BUILDER_URL
