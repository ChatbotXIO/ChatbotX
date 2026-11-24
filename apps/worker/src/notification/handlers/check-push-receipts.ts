import { deviceTokenService } from "@chatbotx.io/business"
import type { NotificationJobCheckPushReceipts } from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"
import { redactPushToken } from "../lib/deliver-push"
import { getExpoClient } from "../lib/expo"

/**
 * Reads Expo's delivery receipts for earlier push tickets. Logs every error
 * receipt (e.g. InvalidCredentials = no APNs key, MessageRateExceeded) and
 * prunes tokens Expo reports as DeviceNotRegistered. Idempotent: re-running
 * only re-logs and re-deletes. Receipt-fetch failures are logged, not retried.
 */
export const checkPushReceipts = async (
  job: NotificationJobCheckPushReceipts,
): Promise<void> => {
  const expo = getExpoClient()
  if (!expo) {
    return
  }

  const tokenByTicketId = new Map(
    job.data.tickets.map((ticket) => [ticket.id, ticket.token]),
  )
  const staleTokens: string[] = []

  for (const ids of expo.chunkPushNotificationReceiptIds([
    ...tokenByTicketId.keys(),
  ])) {
    try {
      const receipts = await expo.getPushNotificationReceiptsAsync(ids)
      for (const [id, receipt] of Object.entries(receipts)) {
        if (receipt.status !== "error") {
          continue
        }
        const token = tokenByTicketId.get(id)
        logger.warn(
          {
            expoError: receipt.details?.error,
            expoMessage: receipt.message,
            token: token ? redactPushToken(token) : undefined,
          },
          "Expo push receipt error",
        )
        if (token && receipt.details?.error === "DeviceNotRegistered") {
          staleTokens.push(token)
        }
      }
    } catch (err) {
      logger.warn({ err }, "Expo push receipt chunk failed")
    }
  }

  if (staleTokens.length > 0) {
    await deviceTokenService.deleteByTokens({ tokens: staleTokens })
    logger.info(
      { count: staleTokens.length },
      "pruned stale push tokens from receipts",
    )
  }
}
