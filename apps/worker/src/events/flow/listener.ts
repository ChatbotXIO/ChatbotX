import { type FlowEvenTypeMap, FlowEventType } from "@chatbotx.io/event-bus"
import { broadcastStathandler } from "../message/handlers/broadcast-stats"
import { sequenceStathandler } from "../message/handlers/sequence-stat"

export const flowListeners: Partial<FlowEvenTypeMap> = {
  [FlowEventType.CLICKED]: [
    {
      name: "flow-stats",
      handler: broadcastStathandler.onClicked.bind(broadcastStathandler),
    },
    {
      name: "sequence-stats",
      handler: sequenceStathandler.onClicked.bind(sequenceStathandler),
    },
  ],
}
