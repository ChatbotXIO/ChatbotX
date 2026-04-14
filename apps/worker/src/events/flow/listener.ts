import {
  broadcastAnalyticsService,
  flowAnalyticsService,
  magicLinkAnalyticsService,
  sequenceAnalyticsService,
} from "@chatbotx.io/analytics"
import type { FlowEvenTypeMap } from "@chatbotx.io/event-bus"
import { FlowEventType } from "@chatbotx.io/flow-config"

export const flowListeners: Partial<FlowEvenTypeMap> = {
  [FlowEventType["flow:clicked"]]: [
    {
      name: "broadcast-stats",
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
    {
      name: "flow-stats",
      handler: flowAnalyticsService.onClicked.bind(flowAnalyticsService),
    },
    {
      name: "magic-link-stats",
      handler: magicLinkAnalyticsService.onClicked.bind(
        magicLinkAnalyticsService,
      ),
    },
  ],
}
