import { conversationService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { ChatJobAction, chatQueue } from "@chatbotx.io/worker-config"
import type { SendWhatsappTemplateRequest } from "../schema/send-template"

/**
 * Sends one approved WhatsApp template into a conversation of the workspace
 * with runtime params. Resolves the conversation and the WhatsApp contact inbox
 * (scoped to the workspace), then enqueues the single-conversation template
 * job, which reuses the broadcast delivery engine and bypasses the 24h/standby
 * gate. The worker checks the template is approved and belongs to the inbox's
 * number, so a template of another number fails there, not here.
 */
export async function sendWhatsappTemplateToConversation(props: {
  workspaceId: string
  conversationId: string
  request: SendWhatsappTemplateRequest
}): Promise<void> {
  const { workspaceId, conversationId, request } = props
  const conversation = await conversationService.findByOrFail({
    where: { id: conversationId, workspaceId },
  })

  const contactInbox =
    await conversationService.resolveContactInboxForConversation({
      conversation,
      workspaceId,
      inboxId: request.inboxId,
    })

  // The worker silently drops a send on any other channel, so refuse it here
  // rather than answer 202 for a message that will never go out.
  if (contactInbox.channel !== "whatsapp") {
    throw new ChatbotXException("This conversation has no WhatsApp inbox")
  }

  await chatQueue.add(ChatJobAction.sendWhatsappTemplateToConversation, {
    type: ChatJobAction.sendWhatsappTemplateToConversation,
    data: {
      conversation,
      contactInbox,
      templateId: request.templateId,
      templateData: request.templateData,
    },
  })
}
