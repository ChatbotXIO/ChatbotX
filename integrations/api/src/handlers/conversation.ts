import type { ConversationHandlers } from "@chatbotx.io/sdk"
import { postSignedEnvelope } from "../lib/delivery"
import type { ApiAuthValue } from "../schema"

export const sendTyping: ConversationHandlers<ApiAuthValue>["sendTyping"] =
  async ({ ctx, data: { contact, typing } }): Promise<void> => {
    if (!ctx.auth.callbackUrl) {
      return
    }

    await postSignedEnvelope({
      callbackUrl: ctx.auth.callbackUrl,
      signingSecret: ctx.auth.signingSecret,
      envelope: {
        event: "typing",
        timestamp: new Date().toISOString(),
        contact: { id: contact.id, sourceId: contact.sourceId },
        typing,
      },
    })
  }

/**
 * Contact reading our messages is inbound — the customer app calls
 * `POST /v1/channels/api/read`, which enqueues this the same way an inbound
 * message does. No outbound callback here.
 */
export const contactMarkAsRead: ConversationHandlers<ApiAuthValue>["contactMarkAsRead"] =
  (): Promise<void> => Promise.resolve()

export const agentMarkAsRead: ConversationHandlers<ApiAuthValue>["agentMarkAsRead"] =
  async ({ ctx, data: { contact } }): Promise<void> => {
    if (!ctx.auth.callbackUrl) {
      return
    }

    await postSignedEnvelope({
      callbackUrl: ctx.auth.callbackUrl,
      signingSecret: ctx.auth.signingSecret,
      envelope: {
        event: "conversation_read",
        timestamp: new Date().toISOString(),
        contact: { id: contact.id, sourceId: contact.sourceId },
      },
    })
  }

export const conversationHandlers = {
  sendTyping,
  contactMarkAsRead,
  agentMarkAsRead,
}
