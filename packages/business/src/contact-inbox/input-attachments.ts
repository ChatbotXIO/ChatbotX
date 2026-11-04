import { getWhatsappFlowResponse } from "@chatbotx.io/sdk"

/**
 * The attachments a message carries as the contact's own input, for the rules
 * that react to what a contact sent (media keywords, the AI agent's image and
 * document input, `{{last_user_input}}`). The files of a form (Flow) response
 * are answers to its fields, kept on the message for the inbox and storage:
 * those rules read that reply as before, by its text.
 */
export const getContactInputAttachments = <Attachment>(message: {
  contentAttributes?: unknown
  attachments?: readonly Attachment[] | null
}): readonly Attachment[] =>
  getWhatsappFlowResponse(message.contentAttributes)
    ? []
    : (message.attachments ?? [])
