import type { Context, OutgoingMessage } from "@chatbotx.io/sdk"
import type { ChatbotxAuthValue } from "../auth"
import { getRealtimeClient } from "./client"

export const broadcastMessageToWorkspaceParty = async (
  ctx: Context<ChatbotxAuthValue>,
  message: OutgoingMessage,
) => {
  const websocketClient = getRealtimeClient(ctx)
  await websocketClient.post(`/parties/workspaces/${message.workspaceId}`, {
    json: {
      eventType: "messageCreated",
      data: message,
    },
  })
}
