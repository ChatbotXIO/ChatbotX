import { isImageUrl } from "@chatbotx.io/ai"
import { findOrFail } from "@chatbotx.io/database/client"
import { conversationModel } from "@chatbotx.io/database/schema"
import {
  type BotResponseTrackingContext,
  ChatJobAction,
  chatQueue,
} from "@chatbotx.io/worker-config"

export async function sendMessageWithRender(
  conversationId: string,
  text: string,
  trackingContext?: BotResponseTrackingContext,
  options?: {
    forceUrl?: boolean
    storagePath?: string
  },
): Promise<void> {
  const shouldSendAsUrl = options?.forceUrl || isImageUrl(text)
  const data = shouldSendAsUrl
    ? {
        conversationId,
        url: text,
        storagePath: options?.storagePath,
        trackingContext,
      }
    : { conversationId, text, trackingContext }

  const conversation = await findOrFail({
    table: conversationModel,
    where: {
      id: conversationId,
    },
    message: "Conversation not found",
  })

  await chatQueue.add(ChatJobAction.sendChatMessage, {
    type: ChatJobAction.sendChatMessage,
    data: {
      ...data,
      conversation,
    },
  })
}
