import { messageAnalyticsService } from "@chatbotx.io/analytics"
import {
  quotaEnforcementService,
  workspaceService,
  workspaceUsageService,
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

  const countsByWorkspace = new Map<string, number>()
  for (const payload of payloads) {
    countsByWorkspace.set(
      payload.workspaceId,
      (countsByWorkspace.get(payload.workspaceId) ?? 0) + 1,
    )
  }

  // Best-effort accounting: `botMessagesUsed` has no reconcile backstop (unlike
  // mac/contacts/etc., which `reconcileOwnerPoolUsage` recomputes from source
  // tables), so a failure here is dropped permanently, not just delayed. Each
  // workspace is isolated so one failing lookup/increment doesn't cost every
  // other workspace in the batch its count too.
  await Promise.all(
    [...countsByWorkspace].map(async ([workspaceId, count]) => {
      try {
        const workspace = await workspaceService.findById({ id: workspaceId })
        await quotaEnforcementService.incrementBy({
          userId: workspace.ownerId,
          metric: "botMessages",
          count,
        })
        await quotaEnforcementService.incrementBy({
          userId: workspace.ownerId,
          metric: "monthlyBotMessages",
          count,
        })
        await workspaceUsageService.increment(workspaceId, "botMessages", count)
      } catch (err) {
        logger.error(
          { err, workspaceId, count },
          "[analytics] bot message quota increment failed",
        )
      }
    }),
  )
}
