"use server"

import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { sendWhatsappTemplateToConversation } from "../lib/send-whatsapp-template"
import { sendWhatsappTemplateRequest } from "../schema/send-template"

/**
 * Sends one approved WhatsApp template into the open conversation with the
 * agent's runtime params (see `sendWhatsappTemplateToConversation`).
 */
export const sendWhatsappTemplateAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(sendWhatsappTemplateRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, conversationId],
      parsedInput,
    } = props

    await sendWhatsappTemplateToConversation({
      workspaceId,
      conversationId,
      request: parsedInput,
    })
  })
