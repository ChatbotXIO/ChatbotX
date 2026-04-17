import {
  broadcastAnalyticsService,
  flowAnalyticsService,
  sequenceAnalyticsService,
} from "@chatbotx.io/analytics"
import type { MessageEvenTypeMap } from "@chatbotx.io/event-bus"
import { messageEventTypeSchema } from "@chatbotx.io/flow-config"

export const messageListeners: Partial<MessageEvenTypeMap> = {
  [messageEventTypeSchema.enum["message:sent"]]: [
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
  [messageEventTypeSchema.enum["message:failed"]]: [
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
  [messageEventTypeSchema.enum["message:delivered"]]: [
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
  [messageEventTypeSchema.enum["message:seen"]]: [
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
