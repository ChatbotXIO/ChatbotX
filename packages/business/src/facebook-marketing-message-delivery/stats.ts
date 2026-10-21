import type {
  FacebookMarketingMessageStatus,
  FacebookMarketingMessageStatusReason,
} from "@chatbotx.io/database/partials"
import {
  facebookMarketingMessageRecipientRepository,
  facebookMarketingMessageRepository,
} from "@chatbotx.io/database/repositories"
import { mmDeliveryError } from "./errors"

export type MarketingMessageCampaignStats = {
  status: FacebookMarketingMessageStatus
  statusReason: FacebookMarketingMessageStatusReason | null
  statusErrorCode: number | null
  statusErrorMessage: string | null
  startsAt: Date | null
  completedAt: Date | null
  tokenCount: number | null
  counts: {
    pending: number
    sent: number
    delivered: number
    failed: number
    unconfirmed: number
  }
  errors: { errorCode: number | null; errorMessage: string; count: number }[]
}

export async function getMarketingMessageStats(input: {
  workspaceId: string
  id: string
}): Promise<MarketingMessageCampaignStats> {
  const campaign =
    await facebookMarketingMessageRepository.findForWorkspace(input)
  if (!campaign) {
    throw mmDeliveryError("mmNotFound")
  }
  const [counts, errors] = await Promise.all([
    facebookMarketingMessageRecipientRepository.countOutcomes(campaign.id),
    facebookMarketingMessageRecipientRepository.errorBreakdown(campaign.id),
  ])
  return {
    status: campaign.status,
    statusReason: campaign.statusReason ?? null,
    statusErrorCode: campaign.statusErrorCode ?? null,
    statusErrorMessage: campaign.statusErrorMessage ?? null,
    startsAt: campaign.startsAt ?? null,
    completedAt: campaign.completedAt ?? null,
    tokenCount: campaign.tokenCount ?? null,
    counts: {
      pending: counts.pending,
      sent: counts.sent + counts.delivered,
      delivered: counts.delivered,
      failed: counts.failed,
      unconfirmed: counts.unconfirmed,
    },
    errors,
  }
}
