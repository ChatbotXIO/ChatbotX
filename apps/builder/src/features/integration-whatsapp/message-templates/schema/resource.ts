import {
  createSelectSchema,
  whatsappMessageTemplateModel,
} from "@chatbotx.io/database/schema"
import { z } from "zod"

export const whatsappMessageTemplateResource = createSelectSchema(
  whatsappMessageTemplateModel,
  {
    id: z.string(),
  },
)
  .pick({
    id: true,
    name: true,
    language: true,
    category: true,
    status: true,
    components: true,
    integrationWhatsappId: true,
  })
  .extend({
    components: z.any(),
  })
export type WhatsappMessageTemplateResource = z.infer<
  typeof whatsappMessageTemplateResource
>

export type MessageTemplateWithComponents = WhatsappMessageTemplateResource & {
  components: unknown
  sourceId: string
}
