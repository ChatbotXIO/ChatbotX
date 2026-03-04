import type { Context, OutgoingMessage } from "@aha.chat/sdk"
import type { ChatbotxAuthValue } from "../auth"
import { getRealtimeClient } from "./client"

export const broadcastMessageToChatbotParty = async (
  ctx: Context<ChatbotxAuthValue>,
  message: OutgoingMessage,
) => {
  const websocketClient = getRealtimeClient(ctx)
  await websocketClient.post(`/parties/chatbots/${message.chatbotId}`, {
    json: {
      eventType: "messageCreated",
      data: message,
    },
  })
}
