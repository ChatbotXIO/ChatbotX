import {
  type MarketingMessageCampaignStep,
  MarketingMessageJobAction,
  marketingMessageCampaignJobId,
  marketingMessageQueue,
} from "@chatbotx.io/worker-config"

/**
 * Enqueues one campaign step on the dedicated queue: a dispatch makes hundreds
 * of sequential Meta calls and must never hold a shared schedule-queue slot.
 */
export const enqueueMarketingMessageStep = (
  campaignRowId: string,
  step: MarketingMessageCampaignStep,
) =>
  marketingMessageQueue.add(
    MarketingMessageJobAction.processCampaign,
    {
      type: MarketingMessageJobAction.processCampaign,
      data: { campaignRowId, step },
    },
    {
      jobId: marketingMessageCampaignJobId(campaignRowId, step),
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: true,
    },
  )
