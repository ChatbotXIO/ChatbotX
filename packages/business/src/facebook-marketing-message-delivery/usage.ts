import { quotaEnforcementService } from "../quota-enforcement/service"
import { workspaceService } from "../workspace/service"
import { workspaceUsageService } from "../workspace-usage/service"

/**
 * Counts Marketing Message sends as bot messages. Mirrors the three increments
 * of the worker's `handleBotMessageSent` (owner pool, monthly pool, workspace).
 */
export async function recordMarketingMessageUsage(input: {
  workspaceId: string
  count: number
}): Promise<void> {
  if (input.count <= 0) {
    return
  }
  const workspace = await workspaceService.findById({ id: input.workspaceId })
  await Promise.all([
    quotaEnforcementService.incrementBy({
      userId: workspace.ownerId,
      metric: "botMessages",
      count: input.count,
    }),
    quotaEnforcementService.incrementBy({
      userId: workspace.ownerId,
      metric: "monthlyBotMessages",
      count: input.count,
    }),
    workspaceUsageService.increment(
      input.workspaceId,
      "botMessages",
      input.count,
    ),
  ])
}
