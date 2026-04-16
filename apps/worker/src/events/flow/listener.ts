import { type FlowEvenTypeMap, FlowEventType } from "@chatbotx.io/event-bus"
import { broadcastStathandler } from "../message/handlers/broadcast-stats"

export const flowListeners: Partial<FlowEvenTypeMap> = {
  [FlowEventType.CLICKED]: [
    {
      name: "flow-stats",
      handler: broadcastStathandler.onClicked.bind(broadcastStathandler),
    },
  ],
}
