import { keys as database } from "@chatbotx.io/database/keys"
import { keys as mail } from "@chatbotx.io/mail/keys"
import { keys as partysocket } from "@chatbotx.io/partysocket-config/keys"
import { createEnv } from "@t3-oss/env-nextjs"
import { z } from "zod"
import { clientEnv } from "./lib/client-env"

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
    WHATSAPP_OVERRIDE_CALLBACK_URI: z.url().optional(),
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
    NEXT_PUBLIC_STORAGE_URL: z.url().optional(),
    NEXT_PUBLIC_ALLOWED_DEV_ORIGINS: z
      .string()
      .optional()
      .transform((val) =>
        val
          ?.split(",")
          .map((v) => v.trim())
          .filter(Boolean),
      ),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_BUILDER_URL:
      clientEnv("NEXT_PUBLIC_BUILDER_URL") || "http://localhost:3123",
    NEXT_PUBLIC_INTERNAL_WS_URL:
      clientEnv("NEXT_PUBLIC_INTERNAL_WS_URL") || "http://localhost:1999",
    NEXT_PUBLIC_INTERNAL_STORAGE_URL:
      clientEnv("NEXT_PUBLIC_INTERNAL_STORAGE_URL") ||
      "http://localhost:9000/chatbotx/",
    NEXT_PUBLIC_EDITION: clientEnv("NEXT_PUBLIC_EDITION") || "community",
    NEXT_PUBLIC_STORAGE_URL: clientEnv("NEXT_PUBLIC_STORAGE_URL"),
    NEXT_PUBLIC_ALLOWED_DEV_ORIGINS: clientEnv(
      "NEXT_PUBLIC_ALLOWED_DEV_ORIGINS",
    ),
  },
  emptyStringAsUndefined: true,
  skipValidation: process.env.SKIP_ENV_CHECK === "true",
})

export const isEnterprise = () => env.NEXT_PUBLIC_EDITION === "enterprise"
export const isCloud = () => env.NEXT_PUBLIC_EDITION === "cloud"
export const isCommunity = () => env.NEXT_PUBLIC_EDITION === "community"
