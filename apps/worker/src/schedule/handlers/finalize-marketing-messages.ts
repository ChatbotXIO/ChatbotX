import { facebookMarketingMessageDeliveryService } from "@chatbotx.io/business"
import { facebookMarketingMessageRepository } from "@chatbotx.io/database/repositories"
import { distributedLock } from "@chatbotx.io/redis"
import { logger } from "../../lib/logger"

const LOCK_KEY = "schedule:finalize-marketing-messages"
const LOCK_TTL_SECONDS = 55

export const finalizeMarketingMessages = async () =>
  distributedLock.runExclusive({
    key: LOCK_KEY,
    timeoutInSeconds: LOCK_TTL_SECONDS,
    fn: async () => {
      const sending =
        await facebookMarketingMessageRepository.listByStatus("sending")

      for (const campaign of sending) {
        try {
          await facebookMarketingMessageDeliveryService.finalize(campaign.id)
        } catch (err) {
          logger.error(
            { err, campaignRowId: campaign.id },
            "finalizeMarketingMessages: finalize failed",
          )
        }
      }

      return { checked: sending.length }
    },
  })
