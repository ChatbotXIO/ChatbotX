import {
  broadcastAnalyticsService,
  sequenceAnalyticsService,
} from "@chatbotx.io/analytics"
import type { FlowEvenTypeMap } from "@chatbotx.io/event-bus"
import { FlowEventType } from "@chatbotx.io/flow-config"

export const flowListeners: Partial<FlowEvenTypeMap> = {
  [FlowEventType["flow:clicked"]]: [
    {
      name: "flow-stats",
      handler: broadcastAnalyticsService.onClicked.bind(
        broadcastAnalyticsService,
      ),
    },
    {
      name: "sequence-stats",
      handler: sequenceAnalyticsService.onClicked.bind(
        sequenceAnalyticsService,
      ),
    },
  ],
}
