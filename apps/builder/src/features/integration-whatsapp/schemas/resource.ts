import {
  createSelectSchema,
  integrationWhatsappModel,
} from "@chatbotx.io/database/schema"
import type { z } from "zod"

export const integrationWhatsappResource = createSelectSchema(
  integrationWhatsappModel,
).pick({
  id: true,
  name: true,
})

export type IntegrationWhatsappResource = z.infer<
  typeof integrationWhatsappResource
>
