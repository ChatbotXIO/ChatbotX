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
