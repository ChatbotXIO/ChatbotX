import type { BaseConfig } from "@chatbotx.io/sdk"
import { customAuthSchema } from "@chatbotx.io/sdk"
import { z } from "zod"

export const emailProviders = z.enum(["gmail", "outlook", "other"])
export type EmailProvider = z.infer<typeof emailProviders>

export type EmailConfig = BaseConfig

export const emailAuthSchema = customAuthSchema.extend({
  provider: emailProviders,
  host: z.string().trim().min(1),
  port: z.number().int().positive(),
  username: z.string().trim().min(1),
  password: z.string().trim().min(1),
  fromAddress: z.string().email(),
})
export type EmailAuthValue = z.infer<typeof emailAuthSchema>

export type EmailActions = Record<string, never>
