import {
  createSelectSchema,
  whatsappFlowModel,
} from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const whatsappFlowResource = createSelectSchema(whatsappFlowModel, {
  id: zodBigintAsString(),
  integrationWhatsappId: zodBigintAsString(),
  completedCount: zodBigintAsString(),
})
  .pick({
    id: true,
    name: true,
    sourceId: true,
    status: true,
    categories: true,
    validationErrors: true,
    completedCount: true,
    integrationWhatsappId: true,
    screens: true,
  })
  .extend({
    categories: z.any(),
    validationErrors: z.any(),
    screens: z.any(),
    integrationWhatsapp: z
      .object({
        id: z.string(),
        inboxId: z.string(),
      })
      .nullish(),
  })
export type WhatsappFlowResource = z.infer<typeof whatsappFlowResource>
