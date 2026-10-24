import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

/**
 * Kill switch for the contact activity store writers: off, every producer call
 * is a no-op. (The read side, `CONTACT_ACTIVITY_FILTERS_ENABLED`, lives with
 * the SQL builder in `@chatbotx.io/database` because the builder enforces it.)
 * Defaults to on.
 */
export const contactActivityEnv = () =>
  createEnv({
    server: {
      CONTACT_ACTIVITY_WRITES_ENABLED: z.stringbool().default(true),
    },
    runtimeEnv: process.env,
    skipValidation: process.env.SKIP_ENV_CHECK === "true",
  })
