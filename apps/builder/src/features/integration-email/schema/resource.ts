import {
  createSelectSchema,
  integrationEmailModel,
} from "@chatbotx.io/database/schema"
import type { z } from "zod"

export const integrationEmailResource = createSelectSchema(
  integrationEmailModel,
).pick({
  id: true,
  name: true,
  provider: true,
  fromAddress: true,
})
export type IntegrationEmailResource = z.infer<typeof integrationEmailResource>
