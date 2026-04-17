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

export const messageTemplateWithComponents =
  whatsappMessageTemplateResource.extend({
    components: z.any(),
    sourceId: z.string(),
  })
export type MessageTemplateWithComponents = z.infer<
  typeof messageTemplateWithComponents
>

export const flowTemplateResource = whatsappMessageTemplateResource.extend({
  integrationWhatsapp: z
    .object({
      id: z.string(),
      inboxId: z.string(),
    })
    .nullish(),
})
export type FlowTemplateResource = z.infer<typeof flowTemplateResource>
