import type { BaseConfig } from "@chatbotx.io/sdk"
import { customAuthSchema } from "@chatbotx.io/sdk"
import { z } from "zod"

export type ApiConfig = BaseConfig

/**
 * `callbackUrl` is duplicated with the `IntegrationApi.callbackUrl` column
 * deliberately: the column is what the settings UI reads/validates, this is
 * what the send path reads off `ctx.auth` without a second query.
 */
export const apiAuthSchema = customAuthSchema.extend({
  callbackUrl: z.url().nullish(),
  signingSecret: z.string().min(1),
})
export type ApiAuthValue = z.infer<typeof apiAuthSchema>

export type ApiActions = Record<string, never>
