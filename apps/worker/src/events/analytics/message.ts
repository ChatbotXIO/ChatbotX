import {
  messageAnalyticsService,
  quotaEnforcementService,
  workspaceService,
} from "@chatbotx.io/business"
import type {
  BotMessageSentEventPayload,
  HumanMessageSentEventPayload,
} from "@chatbotx.io/event-bus"
import { logger } from "../../lib/logger"

export function handleHumanMessageSent(
  payloads: HumanMessageSentEventPayload[],
): Promise<void> {
  return messageAnalyticsService.recordEvents(payloads, "message_human_sent")
}

export async function handleBotMessageSent(
  payloads: BotMessageSentEventPayload[],
): Promise<void> {
  await messageAnalyticsService.recordEvents(payloads, "message_bot_sent")

  try {
    const countsByWorkspace = new Map<string, number>()
    for (const payload of payloads) {
      countsByWorkspace.set(
        payload.workspaceId,
        (countsByWorkspace.get(payload.workspaceId) ?? 0) + 1,
      )
    }

    await Promise.all(
      [...countsByWorkspace].map(async ([workspaceId, count]) => {
        const workspace = await workspaceService.findById({ id: workspaceId })
        await quotaEnforcementService.incrementBy({
          userId: workspace.ownerId,
          metric: "botMessages",
          count,
        })
      }),
    )
  } catch (err) {
    logger.error(
      { err, count: payloads.length },
      "[analytics] bot message quota increment failed",
    )
  }
}
