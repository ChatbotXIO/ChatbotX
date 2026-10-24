import { facebookMarketingMessageRepository } from "@chatbotx.io/database/repositories"
import { distributedLock } from "@chatbotx.io/redis"
import type { MarketingMessageCampaignStep } from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"
import { enqueueMarketingMessageStep } from "../../marketing-message/enqueue-step"

const LOCK_KEY = "schedule:enqueue-marketing-messages"
const LOCK_TTL_SECONDS = 55

export const enqueueMarketingMessages = async () =>
  distributedLock.runExclusive({
    key: LOCK_KEY,
    timeoutInSeconds: LOCK_TTL_SECONDS,
    fn: async () => {
      const due = await facebookMarketingMessageRepository.listDueToStart(
        new Date(),
      )
      let enqueued = 0

      for (const campaign of due) {
        const step: MarketingMessageCampaignStep =
          campaign.status === "waitingNextDay" ? "startDay" : "prepare"
        try {
          await enqueueMarketingMessageStep(campaign.id, step)
          enqueued += 1
        } catch (err) {
          logger.error(
            { err, campaignRowId: campaign.id, step },
            "enqueueMarketingMessages: failed to enqueue campaign",
          )
        }
      }

      return { enqueued }
    },
  })
