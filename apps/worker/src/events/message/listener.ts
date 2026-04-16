import {
  type MessageEvenTypeMap,
  MessageEventType,
} from "@chatbotx.io/event-bus"
import { broadcastStathandler } from "./handlers/broadcast-stats"

export const messageListeners: Partial<MessageEvenTypeMap> = {
  [MessageEventType.SENT]: [
    {
      name: "broadcast-stats",
      handler: broadcastStathandler.onMessageSent.bind(broadcastStathandler),
    },
  ],
  [MessageEventType.FAILED]: [
    {
      name: "broadcast-stats",
      handler: broadcastStathandler.onFailed.bind(broadcastStathandler),
    },
  ],
  [MessageEventType.DELIVERED]: [
    {
      name: "broadcast-stats",
      handler: broadcastStathandler.onDelivered.bind(broadcastStathandler),
    },
  ],
}
