import {
  conversationService,
  deviceTokenService,
  workspaceMemberService,
} from "@chatbotx.io/business"
import type { NotificationJobData } from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"
import { getFirebaseMessaging } from "../lib/firebase"

/**
 * Recipients = the assigned user, else every workspace member (unassigned
 * conversations fan out — noisy for large workspaces but acceptable for v1;
 * presence-aware suppression is a post-MVP concern).
 */
const resolveRecipientUserIds = async (
  job: NotificationJobData,
): Promise<string[]> => {
  if (job.type === "notifyConversationAssigned") {
    return [job.data.assignedUserId]
  }

  const conversation = await conversationService.findByOrFail({
    where: { id: job.data.conversationId, workspaceId: job.data.workspaceId },
  })
  if (conversation.assignedUserId) {
    return [conversation.assignedUserId]
  }
  return await workspaceMemberService.listUserIdsByWorkspaceId({
    workspaceId: job.data.workspaceId,
  })
}

export const sendPushForNotificationJob = async (
  job: NotificationJobData,
): Promise<void> => {
  const messaging = getFirebaseMessaging()
  if (!messaging) {
    return
  }

  const recipientUserIds = await resolveRecipientUserIds(job)
  if (recipientUserIds.length === 0) {
    return
  }

  const tokens = await deviceTokenService.findByUserIds({
    userIds: recipientUserIds,
  })
  if (tokens.length === 0) {
    return
  }

  const { workspaceId, conversationId } = job.data
  const messageId = "messageId" in job.data ? job.data.messageId : ""

  const response = await messaging.sendEachForMulticast({
    tokens: tokens.map((t) => t.token),
    data: { workspaceId, conversationId, messageId },
  })

  const staleTokens: string[] = []
  for (const [index, result] of response.responses.entries()) {
    if (
      !result.success &&
      result.error?.code === "messaging/registration-token-not-registered"
    ) {
      staleTokens.push(tokens[index].token)
    }
  }

  if (staleTokens.length > 0) {
    await deviceTokenService.deleteByTokens({ tokens: staleTokens })
    logger.info(
      { count: staleTokens.length },
      "pruned stale device push tokens",
    )
  }
}
