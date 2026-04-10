import {
  type MessageEvenTypeMap,
  MessageEventType,
} from "@chatbotx.io/event-bus"
import { broadcastStathandler } from "./handlers/broadcast-stats"

export const messageListeners: Partial<MessageEvenTypeMap> = {
  [MessageEventType.SENT]: [
    {
      name: "broadcast-stats",
      handler: broadcastStathandler.onMessageSent,
    },
  ],
  [MessageEventType.FAILED]: [
    {
      name: "broadcast-stats",
      handler: broadcastStathandler.onFailed,
    },
  ],
}
