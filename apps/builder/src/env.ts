import { keys as clickhouse } from "@chatbotx.io/clickhouse/keys"
import { keys as database } from "@chatbotx.io/database/keys"
import { keys as mail } from "@chatbotx.io/mail/keys"
import { keys as partysocket } from "@chatbotx.io/partysocket-config/keys"
import { createEnv } from "@t3-oss/env-nextjs"
import { z } from "zod"

const environmentRule = z.enum(["dev", "prod"]).default("dev")
const editionRule = z
  .enum(["community", "enterprise", "cloud"])
  .default("community")

const _isCommunity = process.env.NEXT_PUBLIC_EDITION === "community"

const baseEnv = {
  client: {
    NEXT_PUBLIC_BUILDER_URL: z.url(),
    NEXT_PUBLIC_ASSET_URL: z.url(),
    NEXT_PUBLIC_ENVIRONMENT: environmentRule,
    NEXT_PUBLIC_EDITION: editionRule,
  },
  runtimeEnv: {
    NEXT_PUBLIC_BUILDER_URL:
      process.env.NEXT_PUBLIC_BUILDER_URL || "http://localhost:3123",
    NEXT_PUBLIC_ASSET_URL:
      process.env.NEXT_PUBLIC_ASSET_URL || "http://localhost:9000/chatbotx/",
    NEXT_PUBLIC_ENVIRONMENT: process.env.NEXT_PUBLIC_ENVIRONMENT || "dev",
    NEXT_PUBLIC_EDITION: process.env.NEXT_PUBLIC_EDITION || "community",
  },
  server: {},
}

const googleAuthEnv = {
  server: {
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
  },
}

const authEnv = {
  server: {
    BETTER_AUTH_SECRET: z.string(),
    BETTER_AUTH_URL: z.url(),
  },
}

export const env = createEnv({
  extends: [partysocket(), database(), mail(), clickhouse()],
  server: {
    ...baseEnv.server,
    ...googleAuthEnv.server,
    ...authEnv.server,
  },
  client: {
    ...baseEnv.client,
  },
  experimental__runtimeEnv: {
    ...baseEnv.runtimeEnv,
  },
  emptyStringAsUndefined: true,
  skipValidation: process.env.SKIP_ENV_CHECK === "true",
})

export const isEnterprise = env.NEXT_PUBLIC_EDITION === "enterprise"
export const isCloud = env.NEXT_PUBLIC_EDITION === "cloud"
export const isCommunity = env.NEXT_PUBLIC_EDITION === "community"
