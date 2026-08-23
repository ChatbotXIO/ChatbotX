import {
  contactService,
  conversationService,
  deviceTokenService,
  workspaceMemberService,
  workspaceService,
} from "@chatbotx.io/business"
import type { ConversationModel } from "@chatbotx.io/database/types"
import type { NotificationJobData } from "@chatbotx.io/worker-config"
import { Expo, type ExpoPushMessage, type ExpoPushToken } from "expo-server-sdk"
import { logger } from "../../lib/logger"
import { buildNotificationContent } from "../lib/build-notification-content"
import { getExpoClient } from "../lib/expo"

/**
 * Recipients = the assigned user, else every workspace member (unassigned
 * conversations fan out — noisy for large workspaces but acceptable for v1;
 * presence-aware suppression is a post-MVP concern).
 */
const resolveRecipientUserIds = async (
  job: NotificationJobData,
  conversation: ConversationModel,
): Promise<string[]> => {
  if (job.type === "notifyConversationAssigned") {
    return [job.data.assignedUserId]
  }

  if (conversation.assignedUserId) {
    return [conversation.assignedUserId]
  }
  return await workspaceMemberService.listUserIdsByWorkspaceId({
    workspaceId: job.data.workspaceId,
  })
}

const resolveNotificationContent = async (
  job: NotificationJobData,
  conversation: ConversationModel,
): Promise<{ title: string; body: string }> => {
  const { workspaceId } = job.data

  const [contact, workspace] = await Promise.all([
    contactService.findById({
      workspaceId,
      id: conversation.contactId,
    }),
    workspaceService.findById({ id: workspaceId }),
  ])

  return buildNotificationContent({
    job,
    contactFullName: contact?.fullName,
    workspaceLanguage: workspace?.language,
  })
}

export const sendPushForNotificationJob = async (
  job: NotificationJobData,
): Promise<void> => {
  const expo = getExpoClient()
  if (!expo) {
    return
  }

  const conversation = await conversationService.findByOrFail({
    where: { id: job.data.conversationId, workspaceId: job.data.workspaceId },
  })

  const recipientUserIds = await resolveRecipientUserIds(job, conversation)
  if (recipientUserIds.length === 0) {
    return
  }

  const deviceTokens = await deviceTokenService.findByUserIds({
    userIds: recipientUserIds,
  })
  if (deviceTokens.length === 0) {
    return
  }

  const validTokens: ExpoPushToken[] = []
  const invalidTokens: string[] = []
  for (const deviceToken of deviceTokens) {
    if (Expo.isExpoPushToken(deviceToken.token)) {
      validTokens.push(deviceToken.token)
    } else {
      invalidTokens.push(deviceToken.token)
    }
  }

  if (invalidTokens.length > 0) {
    await deviceTokenService.deleteByTokens({ tokens: invalidTokens })
  }

  if (validTokens.length === 0) {
    return
  }

  const { workspaceId, conversationId } = job.data
  const messageId = "messageId" in job.data ? job.data.messageId : ""
  const { title, body } = await resolveNotificationContent(job, conversation)

  const messages: ExpoPushMessage[] = validTokens.map((token) => ({
    to: token,
    title,
    body,
    data: { workspaceId, conversationId, messageId },
    sound: "default",
    channelId: "default",
    priority: "high",
  }))

  const chunks = expo.chunkPushNotifications(messages)
  const staleTokens: string[] = []
  let failedChunkCount = 0

  for (const chunk of chunks) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk)
      for (const [index, ticket] of tickets.entries()) {
        if (
          ticket.status === "error" &&
          ticket.details?.error === "DeviceNotRegistered"
        ) {
          const sentMessage = chunk[index]
          if (typeof sentMessage.to === "string") {
            staleTokens.push(sentMessage.to)
          }
        }
      }
    } catch (error) {
      failedChunkCount++
      logger.warn(error, "Expo push chunk failed")
    }
  }

  // If every chunk threw, nothing was delivered — rethrow so BullMQ retries
  // instead of silently dropping the notification. Partial failures stay
  // isolated per-chunk above.
  if (failedChunkCount === chunks.length) {
    throw new Error(`All ${chunks.length} Expo push chunk(s) failed to send`)
  }

  if (staleTokens.length > 0) {
    await deviceTokenService.deleteByTokens({ tokens: staleTokens })
    logger.info(
      { count: staleTokens.length },
      "pruned stale device push tokens",
    )
  }
}
