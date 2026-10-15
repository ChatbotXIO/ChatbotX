import { createEnv } from "@t3-oss/env-nextjs"
import { z } from "zod"

export const keys = () =>
  createEnv({
    server: {
      REDIS_URL: z.url(),
      REDIS_QUEUE_URL: z.url().optional(),
      REDIS_QUEUE_BULK_URL: z.url().optional(),
      NEXT_PHASE: z.string().default(""),
      // Kill switch for re-encoding stored channel images and avatars. "off"
      // stops new jobs and makes queued ones no-ops; objects already stored
      // are left as they are.
      STORED_IMAGE_OPTIMIZATION: z.enum(["on", "off"]).default("on"),
    },
    experimental__runtimeEnv: {},
    skipValidation: process.env.SKIP_ENV_CHECK === "true",
  })
