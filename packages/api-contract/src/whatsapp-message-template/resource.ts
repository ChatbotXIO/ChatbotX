import { integrationWhatsappResource } from "@chatbotx.io/business/integration-whatsapp/schema"
import { whatsappTemplateStatusSchema } from "@chatbotx.io/database/partials"
import {
  createSelectSchema,
  whatsappMessageTemplateModel,
} from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

const whatsappMessageTemplateResource = createSelectSchema(
  whatsappMessageTemplateModel,
  { id: z.string() },
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

export const listWhatsappMessageTemplatesInput = z.object({
  inboxId: zodBigintAsString().optional(),
  integrationWhatsappId: zodBigintAsString().optional(),
  status: whatsappTemplateStatusSchema.optional(),
})
export type ListWhatsappMessageTemplatesInput = z.infer<
  typeof listWhatsappMessageTemplatesInput
>

export const publicListWhatsappMessageTemplatesResponse = z.array(
  whatsappMessageTemplateResource.extend({
    integrationWhatsapp: integrationWhatsappResource,
  }),
)
export type PublicListWhatsappMessageTemplatesResponse = z.infer<
  typeof publicListWhatsappMessageTemplatesResponse
>
