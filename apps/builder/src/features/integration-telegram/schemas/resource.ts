import {
  createSelectSchema,
  integrationTelegramModel,
} from "@aha.chat/database/schema"
import type z from "zod"

export const integrationTelegramResource = createSelectSchema(
  integrationTelegramModel,
)
export type IntegrationTelegramResource = z.infer<
  typeof integrationTelegramResource
>
