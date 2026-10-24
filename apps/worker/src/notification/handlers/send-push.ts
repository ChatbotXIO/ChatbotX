import {
  contactService,
  conversationService,
  workspaceMemberService,
  workspaceService,
} from "@chatbotx.io/business"
import type { ConversationModel } from "@chatbotx.io/database/types"
import type { NotificationJobConversation } from "@chatbotx.io/worker-config"
import { buildNotificationContent } from "../lib/build-notification-content"
import { deliverPushToUsers } from "../lib/deliver-push"
import { getExpoClient } from "../lib/expo"

/**
 * Recipients = the assigned user, else every workspace member (unassigned
 * conversations fan out — noisy for large workspaces but acceptable for v1;
 * presence-aware suppression is a post-MVP concern).
 */
const resolveRecipientUserIds = async (
  job: NotificationJobConversation,
  conversation: ConversationModel,
): Promise<string[]> => {
  if (job.type === "notifyConversationAssigned") {
    return [job.data.assignedUserId]
  }

  const excludeUserId = job.data.excludeUserId
  const recipientUserIds = conversation.assignedUserId
    ? [conversation.assignedUserId]
    : await workspaceMemberService.listUserIdsByWorkspaceId({
        workspaceId: job.data.workspaceId,
      })

  return excludeUserId
    ? recipientUserIds.filter((userId) => userId !== excludeUserId)
    : recipientUserIds
}

const resolveNotificationContent = async (
  job: NotificationJobConversation,
  conversation: ConversationModel,
): Promise<{ title: string; body: string }> => {
  const { workspaceId } = job.data

  const [contact, workspace] = await Promise.all([
    contactService.findById({
      workspaceId,
      id: conversation.contactId,
    }),
    workspaceService.find({ where: { id: workspaceId } }),
  ])

  return buildNotificationContent({
    job,
    contactFullName: contact?.fullName,
    workspaceLanguage: workspace?.language,
  })
}

export const sendPushForNotificationJob = async (
  job: NotificationJobConversation,
): Promise<void> => {
  const expo = getExpoClient()
  if (!expo) {
    return
  }

  const conversation = await conversationService.findByOrFail({
    where: { id: job.data.conversationId, workspaceId: job.data.workspaceId },
  })

  const { workspaceId, conversationId } = job.data
  const messageId = "messageId" in job.data ? job.data.messageId : ""

  await deliverPushToUsers({
    expo,
    userIds: await resolveRecipientUserIds(job, conversation),
    content: async () => ({
      ...(await resolveNotificationContent(job, conversation)),
      data: { workspaceId, conversationId, messageId },
    }),
  })
}
