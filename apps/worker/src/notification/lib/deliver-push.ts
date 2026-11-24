import { deviceTokenService } from "@chatbotx.io/business"
import {
  NotificationJobAction,
  notificationQueue,
  PUSH_RECEIPT_DELAY_MS,
} from "@chatbotx.io/worker-config"
import { Expo, type ExpoPushMessage, type ExpoPushToken } from "expo-server-sdk"
import { logger } from "../../lib/logger"

/** Last chars only — enough to match a row, not enough to replay a token. */
export const redactPushToken = (token: string): string => `…${token.slice(-6)}`

export type PushContent = {
  title: string
  body: string
  data: Record<string, string>
}

/**
 * Sends one push to every device of `userIds`. Malformed and unregistered
 * tokens are pruned. `content` is only built once there is a device to send
 * to. Throws when every chunk failed, so BullMQ retries.
 */
export const deliverPushToUsers = async (input: {
  expo: Expo
  userIds: string[]
  content: () => Promise<PushContent>
}): Promise<void> => {
  const { expo, userIds } = input
  if (userIds.length === 0) {
    return
  }

  const deviceTokens = await deviceTokenService.findByUserIds({ userIds })
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

  const { title, body, data } = await input.content()

  const messages: ExpoPushMessage[] = validTokens.map((token) => ({
    to: token,
    title,
    body,
    data,
    sound: "default",
    channelId: "default",
    priority: "high",
  }))

  const chunks = expo.chunkPushNotifications(messages)
  const staleTokens: string[] = []
  const okTickets: { id: string; token: string }[] = []
  let failedChunkCount = 0

  for (const chunk of chunks) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk)
      for (const [index, ticket] of tickets.entries()) {
        const sentTo = chunk[index].to
        const token = typeof sentTo === "string" ? sentTo : null
        if (ticket.status === "ok") {
          if (token) {
            okTickets.push({ id: ticket.id, token })
          }
          continue
        }
        logger.warn(
          {
            expoError: ticket.details?.error,
            expoMessage: ticket.message,
            token: token ? redactPushToken(token) : undefined,
          },
          "Expo push ticket error",
        )
        if (token && ticket.details?.error === "DeviceNotRegistered") {
          staleTokens.push(token)
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

  await scheduleReceiptCheck(okTickets)
}

/** Best effort: a failed enqueue must not fail an already-sent push. */
const scheduleReceiptCheck = async (
  tickets: { id: string; token: string }[],
): Promise<void> => {
  if (tickets.length === 0) {
    return
  }
  try {
    await notificationQueue.add(
      NotificationJobAction.checkPushReceipts,
      { type: NotificationJobAction.checkPushReceipts, data: { tickets } },
      { delay: PUSH_RECEIPT_DELAY_MS, attempts: 1 },
    )
  } catch (err) {
    logger.warn({ err }, "Unable to enqueue push receipt check")
  }
}
