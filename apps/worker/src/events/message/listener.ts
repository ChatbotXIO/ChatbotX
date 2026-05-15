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
      name: "broadcast-ops",
      handler: broadcastAnalyticsService.onMessageSent.bind(
        broadcastAnalyticsService,
      ),
    },
    {
      name: "sequence-ops",
      handler: sequenceAnalyticsService.onMessageSent.bind(
        sequenceAnalyticsService,
      ),
    },
    {
      name: "flow-ops",
      handler: flowAnalyticsService.onMessageSent.bind(flowAnalyticsService),
    },
  ],
  [messageEventTypeSchema.enum["message:failed"]]: [
    {
      name: "broadcast-ops",
      handler: broadcastAnalyticsService.onFailed.bind(
        broadcastAnalyticsService,
      ),
    },
    {
      name: "sequence-ops",
      handler: sequenceAnalyticsService.onFailed.bind(sequenceAnalyticsService),
    },
    {
      name: "flow-ops",
      handler: flowAnalyticsService.onMessageFailed.bind(flowAnalyticsService),
    },
  ],
  [messageEventTypeSchema.enum["message:delivered"]]: [
    {
      name: "broadcast-ops",
      handler: broadcastAnalyticsService.onDelivered.bind(
        broadcastAnalyticsService,
      ),
    },
    {
      name: "sequence-ops",
      handler: sequenceAnalyticsService.onDelivered.bind(
        sequenceAnalyticsService,
      ),
    },
    {
      name: "flow-ops",
      handler:
        flowAnalyticsService.onMessageDelivered.bind(flowAnalyticsService),
    },
  ],
  [messageEventTypeSchema.enum["message:seen"]]: [
    {
      name: "broadcast-ops",
      handler: broadcastAnalyticsService.onSeen.bind(broadcastAnalyticsService),
    },
    {
      name: "sequence-ops",
      handler: sequenceAnalyticsService.onSeen.bind(sequenceAnalyticsService),
    },
    {
      name: "flow-ops",
      handler: flowAnalyticsService.onMessageSeen.bind(flowAnalyticsService),
    },
  ],
}
