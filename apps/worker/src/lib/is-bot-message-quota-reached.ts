import {
  quotaEnforcementService,
  workspaceService,
} from "@chatbotx.io/business"

/**
 * Checks the owner's live bot-message limits before an outbound bot send.
 * Jobs without a resolvable workspace or owner remain fail-open because they
 * cannot be safely attributed to a quota account.
 */
export async function isBotMessageQuotaReached(
  workspaceId: string | undefined,
): Promise<boolean> {
  if (!workspaceId) {
    return false
  }

  const workspace = await workspaceService.find({ where: { id: workspaceId } })
  if (!workspace?.ownerId) {
    return false
  }

  const [monthlyBotMessagesAtLimit, botMessagesAtLimit] = await Promise.all([
    quotaEnforcementService.isAtLimit({
      userId: workspace.ownerId,
      metric: "monthlyBotMessages",
    }),
    quotaEnforcementService.isAtLimit({
      userId: workspace.ownerId,
      metric: "botMessages",
    }),
  ])

  return monthlyBotMessagesAtLimit || botMessagesAtLimit
}

/**
 * Bot messages the owner can still send: the tighter of the lifetime and
 * monthly limits (`null` = unlimited). Same fail-open rule as
 * {@link isBotMessageQuotaReached}, and `0` exactly when that returns `true`.
 */
export async function getBotMessageQuotaRemaining(
  workspaceId: string | undefined,
): Promise<number | null> {
  if (!workspaceId) {
    return null
  }

  const workspace = await workspaceService.find({ where: { id: workspaceId } })
  if (!workspace?.ownerId) {
    return null
  }

  const [monthlyRemaining, totalRemaining] = await Promise.all([
    quotaEnforcementService.getDualRemainingSlots({
      userId: workspace.ownerId,
      metric: "monthlyBotMessages",
    }),
    quotaEnforcementService.getDualRemainingSlots({
      userId: workspace.ownerId,
      metric: "botMessages",
    }),
  ])

  if (monthlyRemaining === null) {
    return totalRemaining
  }
  if (totalRemaining === null) {
    return monthlyRemaining
  }
  return Math.min(monthlyRemaining, totalRemaining)
}
