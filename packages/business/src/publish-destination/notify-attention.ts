import {
  getPublishConnectionNotificationJobId,
  NotificationJobAction,
  type NotificationJobNotifyPublishConnection,
  notificationQueue,
} from "@chatbotx.io/worker-config"
import { logger } from "../logger"

type PublishConnectionAttention = NotificationJobNotifyPublishConnection["data"]

/**
 * Tells the members who want it that a publishing connection stopped
 * publishing. Call only when the write that caused it really changed the row
 * (the conditional UPDATEs return that), so a recovery storing the same result
 * again does not push twice; the job id adds a second guard per transition.
 * Best effort: a queue failure is logged and never reaches the caller.
 */
export const announcePublishConnectionAttention = async (
  attention: PublishConnectionAttention,
): Promise<void> => {
  const subjectId = attention.publishDestinationId ?? attention.socialAccountId
  if (!subjectId) {
    return
  }
  try {
    await notificationQueue.add(
      NotificationJobAction.notifyPublishConnection,
      { data: attention, type: NotificationJobAction.notifyPublishConnection },
      {
        jobId: getPublishConnectionNotificationJobId({
          alert: attention.alert,
          subjectId,
          transitionKey: attention.transitionKey,
        }),
      },
    )
  } catch (err) {
    logger.warn(
      { err, subjectId },
      "publish-destination: failed to enqueue the connection attention push",
    )
  }
}
