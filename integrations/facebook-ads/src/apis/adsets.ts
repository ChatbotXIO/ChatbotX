import { z } from "zod"
import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { facebookAdsGraphClient } from "../lib/http-client"
import {
  MESSAGING_AD_SET_BID_STRATEGY,
  MESSAGING_AD_SET_BILLING_EVENT,
  MESSAGING_AD_SET_OPTIMIZATION_GOAL,
  META_STATUS,
} from "../messaging-ads/constants"
import type { CreateAdSetInput, MetaAdSet } from "../messaging-ads/types"

/** Meta CREATE endpoints return ONLY `{ id }` — never require name/status here. */
const createResponseSchema = z.object({ id: z.string().trim().min(1) })

/**
 * `POST /act_{adAccount}/adsets` — ABO budget lives here (no campaign
 * budget), always created PAUSED. `optimization_goal`/`billing_event`/
 * `bid_strategy` come from the centralized defaults
 * (`messaging-ads/constants.ts`), verified against v23.0 docs + a live create.
 */
export function createAdSet({
  accessToken,
  adAccountId,
  campaignId,
  name,
  dailyBudgetMinorUnits,
  destinationType,
  promotedObject,
  targeting,
  startTime,
  endTime,
  version = DEFAULT_API_VERSION,
}: CreateAdSetInput): Promise<MetaAdSet> {
  const endpoint = `${version}/${adAccountId}/adsets`

  return rescue(endpoint, async () => {
    const response = await facebookAdsGraphClient.postJsonFields<unknown>(
      endpoint,
      {
        access_token: accessToken,
        name,
        campaign_id: campaignId,
        daily_budget: dailyBudgetMinorUnits,
        billing_event: MESSAGING_AD_SET_BILLING_EVENT,
        optimization_goal: MESSAGING_AD_SET_OPTIMIZATION_GOAL,
        bid_strategy: MESSAGING_AD_SET_BID_STRATEGY,
        destination_type: destinationType,
        promoted_object: promotedObject,
        targeting,
        status: META_STATUS.paused,
        ...(startTime ? { start_time: startTime } : {}),
        ...(endTime ? { end_time: endTime } : {}),
      },
    )
    return createResponseSchema.parse(response)
  })
}

export function updateAdSetStatus(input: {
  accessToken: string
  adSetId: string
  status: (typeof META_STATUS)[keyof typeof META_STATUS]
  version?: string
}): Promise<void> {
  const { accessToken, adSetId, status, version = DEFAULT_API_VERSION } = input
  const endpoint = `${version}/${adSetId}`

  return rescue(endpoint, async () => {
    await facebookAdsGraphClient.postJsonFields<unknown>(endpoint, {
      access_token: accessToken,
      status,
    })
  })
}
