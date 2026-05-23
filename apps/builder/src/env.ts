import { keys as database } from "@chatbotx.io/database/keys"
import { keys as mail } from "@chatbotx.io/mail/keys"
import { keys as partysocket } from "@chatbotx.io/partysocket-config/keys"
import { createEnv } from "@t3-oss/env-nextjs"
import { z } from "zod"

const editionRule = z
  .enum(["community", "enterprise", "cloud"])
  .default("community")

export const env = createEnv({
  extends: [partysocket(), database(), mail()],
  server: {
    PLATFORM_ADMIN_EMAIL: z.email().optional(),
    BETTER_AUTH_SECRET: z
      .string()
      .min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
    BETTER_AUTH_URL: z.url(),
  },
  client: {
    NEXT_PUBLIC_BUILDER_URL: z.url(),
    NEXT_PUBLIC_EDITION: editionRule,
    NEXT_PUBLIC_INTERNAL_WS_URL: z
      .url()
      .optional()
      .default("http://localhost:1999"),
    NEXT_PUBLIC_INTERNAL_STORAGE_URL: z
      .url()
      .optional()
      .default("http://localhost:9000/chatbotx/"),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_BUILDER_URL:
      process.env.NEXT_PUBLIC_BUILDER_URL || "http://localhost:3123",
    NEXT_PUBLIC_INTERNAL_WS_URL:
      process.env.NEXT_PUBLIC_INTERNAL_WS_URL || "http://localhost:1999",
    NEXT_PUBLIC_INTERNAL_STORAGE_URL:
      process.env.NEXT_PUBLIC_INTERNAL_STORAGE_URL ||
      "http://localhost:9000/chatbotx/",
    NEXT_PUBLIC_EDITION: process.env.NEXT_PUBLIC_EDITION || "community",
  },
  emptyStringAsUndefined: true,
  skipValidation: process.env.SKIP_ENV_CHECK === "true",
})

export const isEnterprise = () => env.NEXT_PUBLIC_EDITION === "enterprise"
export const isCloud = () => env.NEXT_PUBLIC_EDITION === "cloud"
export const isCommunity = () => env.NEXT_PUBLIC_EDITION === "community"
