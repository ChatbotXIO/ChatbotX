import { keys as database } from "@aha.chat/database/keys"
import { keys as mail } from "@aha.chat/mail/keys"
import { keys as partysocket } from "@aha.chat/partysocket-config/keys"
import { createEnv } from "@t3-oss/env-nextjs"
import { z } from "zod"

const baseEnv = {
  client: {
    NEXT_PUBLIC_BUILDER_URL: z.string().url(),
    NEXT_PUBLIC_BILLING_URL: z.string().url().optional(),
    NEXT_PUBLIC_ASSET_URL: z.string().url(),
  },
  runtimeEnv: {
    NEXT_PUBLIC_BUILDER_URL: process.env.NEXT_PUBLIC_BUILDER_URL,
    NEXT_PUBLIC_BILLING_URL: process.env.NEXT_PUBLIC_BILLING_URL,
    NEXT_PUBLIC_ASSET_URL: process.env.NEXT_PUBLIC_ASSET_URL,
  },
}

export const env = createEnv({
  extends: [partysocket(), database(), mail()],
  client: {
    ...baseEnv.client,
  },
  experimental__runtimeEnv: {
    ...baseEnv.runtimeEnv,
  },
})
