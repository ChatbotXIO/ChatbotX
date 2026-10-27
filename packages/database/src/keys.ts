import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const keys = () =>
  createEnv({
    server: {
      DATABASE_URL: z.url(),
      DATABASE_DEBUG: z.stringbool().optional().default(false),
      DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(500).default(10),
      MESSAGE_SHARDS_PASSWORD: z.string().optional(),
      MESSAGE_SHARDS_SSL: z.stringbool().optional().default(false),
      // Kill switch for the ten activity-backed contact filters (Executed
      // Flow/Step, Keywords Received, Sent message, Last Delivered, WhatsApp
      // Flows, Email x4). Off: discovery omits them and any saved condition
      // fails closed (matches nobody), so an audience never silently widens.
      CONTACT_ACTIVITY_FILTERS_ENABLED: z.stringbool().default(true),
    },
    runtimeEnv: process.env,
    skipValidation: process.env.SKIP_ENV_CHECK === "true",
  })

export const env = keys()
