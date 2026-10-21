import { facebookMarketingMessageRepository } from "@chatbotx.io/database/repositories"
import { distributedLock } from "@chatbotx.io/redis"
import { logger } from "../../lib/logger"
import { enqueueMarketingMessageStep } from "../../marketing-message/enqueue-step"

const LOCK_KEY = "schedule:dispatch-marketing-messages"
const LOCK_TTL_SECONDS = 55

export const dispatchMarketingMessages = async () =>
  distributedLock.runExclusive({
    key: LOCK_KEY,
    timeoutInSeconds: LOCK_TTL_SECONDS,
    fn: async () => {
      const sending =
        await facebookMarketingMessageRepository.listByStatus("sending")
      let enqueued = 0

      for (const campaign of sending) {
        try {
          await enqueueMarketingMessageStep(campaign.id, "dispatch")
          enqueued += 1
        } catch (err) {
          logger.error(
            { err, campaignRowId: campaign.id },
            "dispatchMarketingMessages: failed to enqueue campaign",
          )
        }
      }

      return { enqueued }
    },
  })
