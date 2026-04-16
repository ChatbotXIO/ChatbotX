import {
  broadcastAnalyticsService,
  flowAnalyticsService,
  sequenceAnalyticsService,
} from "@chatbotx.io/analytics"
import type { MessageEvenTypeMap } from "@chatbotx.io/event-bus"
import { MessageEventType } from "@chatbotx.io/flow-config"

export const messageListeners: Partial<MessageEvenTypeMap> = {
  [MessageEventType["message:sent"]]: [
    {
      name: "broadcast-stats",
      handler: broadcastAnalyticsService.onMessageSent.bind(
        broadcastAnalyticsService,
      ),
    },
    {
      name: "sequence-stats",
      handler: sequenceAnalyticsService.onMessageSent.bind(
        sequenceAnalyticsService,
      ),
    },
    {
      name: "flow-stats",
      handler: flowAnalyticsService.onMessageSent.bind(flowAnalyticsService),
    },
  ],
  [MessageEventType["message:failed"]]: [
    {
      name: "broadcast-stats",
      handler: broadcastAnalyticsService.onFailed.bind(
        broadcastAnalyticsService,
      ),
    },
    {
      name: "sequence-stats",
      handler: sequenceAnalyticsService.onFailed.bind(sequenceAnalyticsService),
    },
    {
      name: "flow-stats",
      handler: flowAnalyticsService.onMessageFailed.bind(flowAnalyticsService),
    },
  ],
  [MessageEventType["message:delivered"]]: [
    {
      name: "broadcast-stats",
      handler: broadcastAnalyticsService.onDelivered.bind(
        broadcastAnalyticsService,
      ),
    },
    {
      name: "sequence-stats",
      handler: sequenceAnalyticsService.onDelivered.bind(
        sequenceAnalyticsService,
      ),
    },
    {
      name: "flow-stats",
      handler:
        flowAnalyticsService.onMessageDelivered.bind(flowAnalyticsService),
    },
  ],
  [MessageEventType["message:seen"]]: [
    {
      name: "broadcast-stats",
      handler: broadcastAnalyticsService.onSeen.bind(broadcastAnalyticsService),
    },
    {
      name: "sequence-stats",
      handler: sequenceAnalyticsService.onSeen.bind(sequenceAnalyticsService),
    },
    {
      name: "flow-stats",
      handler: flowAnalyticsService.onMessageSeen.bind(flowAnalyticsService),
    },
  ],
}
