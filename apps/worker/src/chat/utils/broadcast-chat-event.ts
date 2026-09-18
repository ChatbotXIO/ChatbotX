import type { RealtimeEventData } from "@chatbotx.io/partysocket-config"
import { ChatJobAction, chatQueue } from "@chatbotx.io/worker-config"

/** Fans a realtime event out to the workspace through the chat queue. */
export function broadcastChatEvent(
  workspaceId: string,
  event: RealtimeEventData,
) {
  return chatQueue.add(ChatJobAction.broadcastEvent, {
    type: ChatJobAction.broadcastEvent,
    data: { workspaceId, event },
  })
}
