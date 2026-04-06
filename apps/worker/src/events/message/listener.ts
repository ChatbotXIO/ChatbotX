import {
  type MessageEvenTypeMap,
  MessageEventType,
} from "@chatbotx.io/event-bus"
import { broadcastStathandler } from "./handlers/broadcast-stats"
import { sequenceStathandler } from "./handlers/sequence-stat"

export const messageListeners: Partial<MessageEvenTypeMap> = {
  [MessageEventType.SENT]: [
    {
      name: "broadcast-stats",
      handler: broadcastStathandler.onMessageSent.bind(broadcastStathandler),
    },
    {
      name: "sequence-stats",
      handler: sequenceStathandler.onMessageSent.bind(sequenceStathandler),
    },
  ],
  [MessageEventType.FAILED]: [
    {
      name: "broadcast-stats",
      handler: broadcastStathandler.onFailed.bind(broadcastStathandler),
    },
    {
      name: "sequence-stats",
      handler: sequenceStathandler.onFailed.bind(sequenceStathandler),
    },
  ],
  [MessageEventType.DELIVERED]: [
    {
      name: "broadcast-stats",
      handler: broadcastStathandler.onDelivered.bind(broadcastStathandler),
    },
    {
      name: "sequence-stats",
      handler: sequenceStathandler.onDelivered.bind(sequenceStathandler),
    },
  ],
  [MessageEventType.SEEN]: [
    {
      name: "broadcast-stats",
      handler: broadcastStathandler.onSeen.bind(broadcastStathandler),
    },
    {
      name: "sequence-stats",
      handler: sequenceStathandler.onSeen.bind(sequenceStathandler),
    },
  ],
}
