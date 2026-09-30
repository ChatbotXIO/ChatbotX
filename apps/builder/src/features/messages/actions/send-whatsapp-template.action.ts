"use server"

import { conversationService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { ChatJobAction, chatQueue } from "@chatbotx.io/worker-config"
import { workspaceActionClient } from "@/lib/safe-action"
import { sendWhatsappTemplateRequest } from "../schema/send-template"

/**
 * Sends one approved WhatsApp template into the open conversation with the
 * agent's runtime params. Resolves the conversation + WhatsApp contact inbox
 * (scoped to the workspace), then enqueues the single-conversation template
 * job, which reuses the broadcast delivery engine and bypasses the 24h/standby
 * gate (`isTemplateMessage`).
 */
export const sendWhatsappTemplateAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(sendWhatsappTemplateRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, conversationId],
      parsedInput,
    } = props

    const conversation = await conversationService.findByOrFail({
      where: { id: conversationId, workspaceId },
    })

    const contactInbox =
      await conversationService.resolveContactInboxForConversation({
        conversation,
        workspaceId,
        inboxId: parsedInput.inboxId,
      })

    await chatQueue.add(ChatJobAction.sendWhatsappTemplateToConversation, {
      type: ChatJobAction.sendWhatsappTemplateToConversation,
      data: {
        conversation,
        contactInbox,
        templateId: parsedInput.templateId,
        templateData: parsedInput.templateData,
      },
    })
  })
