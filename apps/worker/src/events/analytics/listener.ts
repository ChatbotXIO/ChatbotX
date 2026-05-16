import type {
  AnalyticsDashboardEvent,
  AnalyticsDashboardEventMap,
  BaseEventListener,
} from "@chatbotx.io/event-bus"
import { logger } from "../../lib/logger"
import { handleMessageBotReceived } from "./bot-message"
import { handleContactCreated, handleContactDeleted } from "./contact"
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
import { handleBotMessageSent, handleHumanMessageSent } from "./message"

function runHandler<T extends AnalyticsDashboardEvent>(
  eventType: AnalyticsDashboardEvent["eventType"],
  handler: (events: T[]) => Promise<unknown>,
  events: T[] | undefined,
): Promise<unknown> {
  if (!events || events.length === 0) {
    return Promise.resolve()
  }
  return handler(events).catch((error) => {
    logger.error(
      { error, eventType, count: events.length },
      "[analytics] dashboard handler failed",
    )
  })
}

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
          runHandler(
            "contact:created",
            handleContactCreated,
            grouped.get("contact:created") as Parameters<
              typeof handleContactCreated
            >[0],
          ),
          runHandler(
            "contact:deleted",
            handleContactDeleted,
            grouped.get("contact:deleted") as Parameters<
              typeof handleContactDeleted
            >[0],
          ),
          runHandler(
            "message:human_sent",
            handleHumanMessageSent,
            grouped.get("message:human_sent") as Parameters<
              typeof handleHumanMessageSent
            >[0],
          ),
          runHandler(
            "message:bot_sent",
            handleBotMessageSent,
            grouped.get("message:bot_sent") as Parameters<
              typeof handleBotMessageSent
            >[0],
          ),
          runHandler(
            "conversation:created",
            handleConversationCreated,
            grouped.get("conversation:created") as Parameters<
              typeof handleConversationCreated
            >[0],
          ),
          runHandler(
            "conversation:assigned",
            handleConversationAssigned,
            grouped.get("conversation:assigned") as Parameters<
              typeof handleConversationAssigned
            >[0],
          ),
          runHandler(
            "conversation:unassigned",
            handleConversationUnassigned,
            grouped.get("conversation:unassigned") as Parameters<
              typeof handleConversationUnassigned
            >[0],
          ),
          runHandler(
            "conversation:transferred_to_human",
            handleConversationTransferredToHuman,
            grouped.get("conversation:transferred_to_human") as Parameters<
              typeof handleConversationTransferredToHuman
            >[0],
          ),
          runHandler(
            "conversation:transferred_to_bot",
            handleConversationTransferredToBot,
            grouped.get("conversation:transferred_to_bot") as Parameters<
              typeof handleConversationTransferredToBot
            >[0],
          ),
          runHandler(
            "conversation:followed",
            handleConversationFollowed,
            grouped.get("conversation:followed") as Parameters<
              typeof handleConversationFollowed
            >[0],
          ),
          runHandler(
            "conversation:unfollowed",
            handleConversationUnfollowed,
            grouped.get("conversation:unfollowed") as Parameters<
              typeof handleConversationUnfollowed
            >[0],
          ),
          runHandler(
            "conversation:archived",
            handleConversationArchived,
            grouped.get("conversation:archived") as Parameters<
              typeof handleConversationArchived
            >[0],
          ),
          runHandler(
            "conversation:unarchived",
            handleConversationUnarchived,
            grouped.get("conversation:unarchived") as Parameters<
              typeof handleConversationUnarchived
            >[0],
          ),
          runHandler(
            "message:bot_received",
            handleMessageBotReceived,
            grouped.get("message:bot_received") as Parameters<
              typeof handleMessageBotReceived
            >[0],
          ),
        ])
      },
    },
  ],
}
