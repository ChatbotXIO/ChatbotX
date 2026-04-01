import {
  createSelectSchema,
  integrationWebchatModel,
} from "@chatbotx.io/database/schema"
import type { z } from "zod"

export const integrationWebchatResource = createSelectSchema(
  integrationWebchatModel,
).pick({
  id: true,
  name: true,
})
export type IntegrationWebchatResource = z.infer<
  typeof integrationWebchatResource
>
