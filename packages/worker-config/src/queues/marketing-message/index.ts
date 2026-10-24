import { Queue } from "bullmq"
import {
  defaultJobOptions,
  fakeQueue,
  getQueueConnection,
  isNoRedisEnv,
} from "../../lib/connection"
import { queueNames } from "../../lib/types"

/**
 * FB Marketing Messages campaign work. The per-minute crons stay on the shared
 * `schedule` queue and only enqueue here: one dispatch can make hundreds of
 * sequential Meta calls, so it must never hold a schedule-queue slot.
 */
export const MarketingMessageJobAction = {
  processCampaign: "processCampaign",
} as const

export type MarketingMessageCampaignStep = "prepare" | "startDay" | "dispatch"

export type MarketingMessageJobProcessCampaign = {
  type: typeof MarketingMessageJobAction.processCampaign
  data: {
    campaignRowId: string
    step: MarketingMessageCampaignStep
  }
}

export type MarketingMessageJobData = MarketingMessageJobProcessCampaign

/** One job per (step, campaign); no `:` — BullMQ rejects it in a custom job id. */
export const marketingMessageCampaignJobId = (
  id: string,
  step: MarketingMessageCampaignStep,
) => `mm-campaign-${step}-${id}`

export const marketingMessageQueue = isNoRedisEnv()
  ? fakeQueue
  : new Queue<MarketingMessageJobData>(queueNames.enum.marketingMessage, {
      connection: getQueueConnection(queueNames.enum.marketingMessage),
      defaultJobOptions,
    })
