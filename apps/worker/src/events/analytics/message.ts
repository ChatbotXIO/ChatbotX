import { messageAnalyticsService } from "@chatbotx.io/analytics"
import {
  quotaEnforcementService,
  workspaceBotMessageUsageService,
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
        const [quotaResult, ledgerResult] = await Promise.allSettled([
          Promise.all([
            quotaEnforcementService.incrementBy({
              userId: workspace.ownerId,
              metric: "botMessages",
              count,
            }),
            quotaEnforcementService.incrementBy({
              userId: workspace.ownerId,
              metric: "monthlyBotMessages",
              count,
            }),
            workspaceUsageService.increment(workspaceId, "botMessages", count),
          ]),
          workspaceBotMessageUsageService.increment({
            count,
            ownerId: workspace.ownerId,
            tenantId: workspace.tenantId,
            workspaceId,
          }),
        ])
        if (quotaResult.status === "rejected") {
          logger.error(
            { err: quotaResult.reason, workspaceId, count },
            "[analytics] bot message quota increment failed",
          )
        }
        if (ledgerResult.status === "rejected") {
          logger.error(
            { err: ledgerResult.reason, workspaceId, count },
            "[analytics] bot message usage ledger write failed",
          )
        }
      } catch (err) {
        logger.error(
          { err, workspaceId, count },
          "[analytics] bot message workspace lookup failed",
        )
      }
    }),
  )
}
