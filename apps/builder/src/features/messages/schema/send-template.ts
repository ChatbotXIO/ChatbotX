import { waTemplateParamsSchema } from "@chatbotx.io/flow-config"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

/**
 * Payload for sending one approved WhatsApp template straight into the open
 * conversation (the composer's "Send template" tab). `templateData` holds the
 * agent's runtime params, shaped exactly like a flow step's template params so
 * the same delivery engine handles it.
 */
export const sendWhatsappTemplateRequest = z.object({
  templateId: z.string().trim().min(1),
  templateData: waTemplateParamsSchema.optional(),
  // Which of the contact's inboxes to send from; omitted resolves the recent one.
  inboxId: zodBigintAsString().optional(),
})

export type SendWhatsappTemplateRequest = z.infer<
  typeof sendWhatsappTemplateRequest
>
