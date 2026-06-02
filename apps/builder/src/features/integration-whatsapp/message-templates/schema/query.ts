import { integrationWhatsappResource } from "@chatbotx.io/business"
import { whatsappTemplateStatusSchema } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { whatsappMessageTemplateResource } from "./resource"

export const listWhatsappMessageTemplatesRequest = z.object({
  workspaceId: zodBigintAsString(),
  inboxId: zodBigintAsString().optional(),
  integrationWhatsappId: zodBigintAsString().optional(),
  status: whatsappTemplateStatusSchema.optional(),
})
export type ListWhatsappMessageTemplatesRequest = z.infer<
  typeof listWhatsappMessageTemplatesRequest
>

export const listWhatsappMessageTemplatesResponse = z.array(
  whatsappMessageTemplateResource.extend({
    integrationWhatsapp: integrationWhatsappResource,
  }),
)
export type ListWhatsappMessageTemplatesResponse = z.infer<
  typeof listWhatsappMessageTemplatesResponse
>
