import type {
  AnalyticsDashboardEvent,
  AnalyticsDashboardEventMap,
  BaseEventListener,
} from "@chatbotx.io/event-bus"
import { handleMessageBotReceived } from "./bot-message"
import {
  handleBotMessageSent,
  handleContactCreated,
  handleContactDeleted,
  handleHumanMessageSent,
} from "./contact"
import {
  handleConversationArchived,
  handleConversationAssigned,
  handleConversationCreated,
  handleConversationFollowed,
  handleConversationTransferredToBot,
  handleConversationTransferredToHuman,
  handleConversationUnarchived,
  handleConversationUnassigned,
  handleConversationUnfollowed,
} from "./conversation"

type DashboardListener = BaseEventListener<AnalyticsDashboardEvent>

function groupByEventType(
  payloads: AnalyticsDashboardEvent[],
): Map<AnalyticsDashboardEvent["eventType"], AnalyticsDashboardEvent[]> {
  const map = new Map<
    AnalyticsDashboardEvent["eventType"],
    AnalyticsDashboardEvent[]
  >()
  for (const p of payloads) {
    const existing = map.get(p.eventType) ?? []
    existing.push(p)
    map.set(p.eventType, existing)
  }
  return map
}

export const analyticsDashboardListeners: Partial<
  Record<keyof AnalyticsDashboardEventMap, DashboardListener[]>
> = {
  "analytics:dashboard": [
    {
      name: "analytics-dashboard",
      handler: async (payloads: AnalyticsDashboardEvent[]) => {
        if (payloads.length === 0) {
          return
        }

        const grouped = groupByEventType(payloads)

        await Promise.all([
          grouped.has("contact:created")
            ? handleContactCreated(
                grouped.get("contact:created") as Parameters<
                  typeof handleContactCreated
                >[0],
              )
            : Promise.resolve(),
          grouped.has("contact:deleted")
            ? handleContactDeleted(
                grouped.get("contact:deleted") as Parameters<
                  typeof handleContactDeleted
                >[0],
              )
            : Promise.resolve(),
          grouped.has("message:human_sent")
            ? handleHumanMessageSent(
                grouped.get("message:human_sent") as Parameters<
                  typeof handleHumanMessageSent
                >[0],
              )
            : Promise.resolve(),
          grouped.has("message:bot_sent")
            ? handleBotMessageSent(
                grouped.get("message:bot_sent") as Parameters<
                  typeof handleBotMessageSent
                >[0],
              )
            : Promise.resolve(),
          grouped.has("conversation:created")
            ? handleConversationCreated(
                grouped.get("conversation:created") as Parameters<
                  typeof handleConversationCreated
                >[0],
              )
            : Promise.resolve(),
          grouped.has("conversation:assigned")
            ? handleConversationAssigned(
                grouped.get("conversation:assigned") as Parameters<
                  typeof handleConversationAssigned
                >[0],
              )
            : Promise.resolve(),
          grouped.has("conversation:unassigned")
            ? handleConversationUnassigned(
                grouped.get("conversation:unassigned") as Parameters<
                  typeof handleConversationUnassigned
                >[0],
              )
            : Promise.resolve(),
          grouped.has("conversation:transferred_to_human")
            ? handleConversationTransferredToHuman(
                grouped.get("conversation:transferred_to_human") as Parameters<
                  typeof handleConversationTransferredToHuman
                >[0],
              )
            : Promise.resolve(),
          grouped.has("conversation:transferred_to_bot")
            ? handleConversationTransferredToBot(
                grouped.get("conversation:transferred_to_bot") as Parameters<
                  typeof handleConversationTransferredToBot
                >[0],
              )
            : Promise.resolve(),
          grouped.has("conversation:followed")
            ? handleConversationFollowed(
                grouped.get("conversation:followed") as Parameters<
                  typeof handleConversationFollowed
                >[0],
              )
            : Promise.resolve(),
          grouped.has("conversation:unfollowed")
            ? handleConversationUnfollowed(
                grouped.get("conversation:unfollowed") as Parameters<
                  typeof handleConversationUnfollowed
                >[0],
              )
            : Promise.resolve(),
          grouped.has("conversation:archived")
            ? handleConversationArchived(
                grouped.get("conversation:archived") as Parameters<
                  typeof handleConversationArchived
                >[0],
              )
            : Promise.resolve(),
          grouped.has("conversation:unarchived")
            ? handleConversationUnarchived(
                grouped.get("conversation:unarchived") as Parameters<
                  typeof handleConversationUnarchived
                >[0],
              )
            : Promise.resolve(),
          grouped.has("message:bot_received")
            ? handleMessageBotReceived(
                grouped.get("message:bot_received") as Parameters<
                  typeof handleMessageBotReceived
                >[0],
              )
            : Promise.resolve(),
        ])
      },
    },
  ],
}
