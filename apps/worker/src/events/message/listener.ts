import {
  broadcastAnalyticsService,
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
  ],
}
