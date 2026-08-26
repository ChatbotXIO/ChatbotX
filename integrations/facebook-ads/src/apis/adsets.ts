import { z } from "zod"
import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { facebookAdsGraphClient } from "../lib/http-client"
import { fetchAllMessagingAdsPages } from "../lib/messaging-ads-pagination"
import {
  MESSAGING_AD_SET_BID_STRATEGY,
  MESSAGING_AD_SET_BILLING_EVENT,
  MESSAGING_AD_SET_OPTIMIZATION_GOAL,
  META_STATUS,
  operationIdNameFilter,
} from "../messaging-ads/constants"
import type { CreateAdSetInput, MetaAdSet } from "../messaging-ads/types"

const AD_SET_FIELDS = "id,name,status,effective_status"

const adSetSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().optional(),
  status: z.string().optional(),
  effective_status: z.string().optional(),
})

/** Meta CREATE endpoints return ONLY `{ id }` — never require name/status here. */
const createResponseSchema = z.object({ id: z.string().trim().min(1) })

/**
 * `POST /act_{adAccount}/adsets` — ABO budget lives here (no campaign
 * budget), always created PAUSED. `optimization_goal`/`billing_event`/
 * `bid_strategy` come from the centralized defaults
 * (`messaging-ads/constants.ts`) — // Phase 0 confirm before real spend.
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
    // Multipart form-data body (Meta's documented `-F` transport). Objects are
    // JSON-string field values.
    const response = await facebookAdsGraphClient.postFormFields<unknown>(
      endpoint,
      {
        access_token: accessToken,
        name,
        campaign_id: campaignId,
        daily_budget: String(dailyBudgetMinorUnits),
        billing_event: MESSAGING_AD_SET_BILLING_EVENT,
        optimization_goal: MESSAGING_AD_SET_OPTIMIZATION_GOAL,
        bid_strategy: MESSAGING_AD_SET_BID_STRATEGY,
        destination_type: destinationType,
        promoted_object: JSON.stringify(promotedObject),
        targeting: JSON.stringify(targeting),
        status: META_STATUS.paused,
        ...(startTime ? { start_time: startTime } : {}),
        ...(endTime ? { end_time: endTime } : {}),
      },
    )
    return createResponseSchema.parse(response)
  })
}

/** Reconcile step — finds an ad set already created for this operation, scoped to the found campaign. */
export function findAdSetByOperationId(input: {
  accessToken: string
  campaignId: string
  operationId: string
  version?: string
}): Promise<MetaAdSet | null> {
  const {
    accessToken,
    campaignId,
    operationId,
    version = DEFAULT_API_VERSION,
  } = input
  const endpoint = `${version}/${campaignId}/adsets`

  return rescue(endpoint, async () => {
    const rows = await fetchAllMessagingAdsPages<unknown>(endpoint, {
      fields: AD_SET_FIELDS,
      filtering: operationIdNameFilter(operationId),
      limit: "10",
      access_token: accessToken,
    })
    const parsed = z.array(adSetSchema).parse(rows)
    return parsed[0] ?? null
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
    // `status` as a multipart form field — see `updateCampaignStatus`.
    await facebookAdsGraphClient.postFormFields<unknown>(endpoint, {
      access_token: accessToken,
      status,
    })
  })
}
