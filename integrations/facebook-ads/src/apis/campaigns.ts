import { z } from "zod"
import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { facebookAdsGraphClient } from "../lib/http-client"
import { fetchAllMessagingAdsPages } from "../lib/messaging-ads-pagination"
import {
  CAMPAIGN_BUYING_TYPE_AUCTION,
  MESSAGING_CAMPAIGN_OBJECTIVE,
  META_STATUS,
  operationIdNameFilter,
} from "../messaging-ads/constants"
import type { CreateCampaignInput, MetaCampaign } from "../messaging-ads/types"

const CAMPAIGN_FIELDS = "id,name,status,effective_status"

const campaignSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().optional(),
  status: z.string().optional(),
  effective_status: z.string().optional(),
})

/** Meta CREATE endpoints return ONLY `{ id }` — never require name/status here. */
const createResponseSchema = z.object({ id: z.string().trim().min(1) })

/**
 * The value for Meta's REQUIRED `special_ad_categories`. Meta rejects an empty
 * array `[]` on this required field ("(#100) … is required"), so "no category"
 * is expressed as the documented sentinel `["NONE"]`. When real categories are
 * present the internal "NONE" marker is stripped and only the real ones sent.
 */
function buildSpecialAdCategoriesParam(
  specialAdCategories: string[],
): string[] {
  const real = specialAdCategories.filter((category) => category !== "NONE")
  return real.length > 0 ? real : ["NONE"]
}

/** `POST /act_{adAccount}/campaigns` — always created PAUSED, ABO (no campaign budget). */
export function createCampaign({
  accessToken,
  adAccountId,
  name,
  specialAdCategories,
  specialAdCategoryCountry,
  version = DEFAULT_API_VERSION,
}: CreateCampaignInput): Promise<MetaCampaign> {
  const endpoint = `${version}/${adAccountId}/campaigns`
  const specialAdCategoriesParam = JSON.stringify(
    buildSpecialAdCategoriesParam(specialAdCategories),
  )

  return rescue(endpoint, async () => {
    // Multipart form-data body (Meta's documented `-F` transport). Array params
    // are JSON-string field values. `special_ad_categories` is REQUIRED; "no
    // category" is the sentinel `["NONE"]` (Meta rejects an empty `[]`).
    const response = await facebookAdsGraphClient.postFormFields<unknown>(
      endpoint,
      {
        access_token: accessToken,
        name,
        objective: MESSAGING_CAMPAIGN_OBJECTIVE,
        buying_type: CAMPAIGN_BUYING_TYPE_AUCTION,
        special_ad_categories: specialAdCategoriesParam,
        ...(specialAdCategoryCountry?.length
          ? {
              special_ad_category_country: JSON.stringify(
                specialAdCategoryCountry,
              ),
            }
          : {}),
        status: META_STATUS.paused,
      },
    )
    return createResponseSchema.parse(response)
  })
}

/**
 * Reconcile step (out/plan/ctm-ctid-ads-manager.md "Durable operation model"):
 * finds a campaign already created for this `operationId` (via the `[cbx:...]`
 * name marker) BEFORE retrying a create, so a resumed operation adopts the
 * existing object instead of duplicating it.
 */
export function findCampaignByOperationId(input: {
  accessToken: string
  adAccountId: string
  operationId: string
  version?: string
}): Promise<MetaCampaign | null> {
  const {
    accessToken,
    adAccountId,
    operationId,
    version = DEFAULT_API_VERSION,
  } = input
  const endpoint = `${version}/${adAccountId}/campaigns`

  return rescue(endpoint, async () => {
    const rows = await fetchAllMessagingAdsPages<unknown>(endpoint, {
      fields: CAMPAIGN_FIELDS,
      filtering: operationIdNameFilter(operationId),
      limit: "10",
      access_token: accessToken,
    })
    const parsed = z.array(campaignSchema).parse(rows)
    return parsed[0] ?? null
  })
}

export function updateCampaignStatus(input: {
  accessToken: string
  campaignId: string
  status: (typeof META_STATUS)[keyof typeof META_STATUS]
  version?: string
}): Promise<void> {
  const {
    accessToken,
    campaignId,
    status,
    version = DEFAULT_API_VERSION,
  } = input
  const endpoint = `${version}/${campaignId}`

  return rescue(endpoint, async () => {
    // `status` as a multipart form field — the same transport as every create
    // (Meta's documented `-F`), never a JSON body.
    await facebookAdsGraphClient.postFormFields<unknown>(endpoint, {
      access_token: accessToken,
      status,
    })
  })
}

export function getCampaign(input: {
  accessToken: string
  campaignId: string
  version?: string
}): Promise<MetaCampaign> {
  const { accessToken, campaignId, version = DEFAULT_API_VERSION } = input
  const endpoint = `${version}/${campaignId}`

  return rescue(endpoint, async () => {
    const response = await facebookAdsGraphClient.get<unknown>(endpoint, {
      searchParams: { fields: CAMPAIGN_FIELDS, access_token: accessToken },
    })
    return campaignSchema.parse(response)
  })
}

/** Meta's `?ids=` multi-get caps at 50 objects per request. */
const MULTI_GET_CHUNK = 50

/** Lists every ChatbotX-created campaign still live on the ad account, with `effective_status`. */
export function listCampaignsByIds(input: {
  accessToken: string
  campaignIds: string[]
  version?: string
}): Promise<MetaCampaign[]> {
  const { accessToken, campaignIds, version = DEFAULT_API_VERSION } = input
  if (campaignIds.length === 0) {
    return Promise.resolve([])
  }
  const endpoint = `${version}`

  return rescue(endpoint, async () => {
    // Sequential per chunk — a burst of parallel multi-gets on a large history
    // would risk Meta rate limits and fail the whole list read.
    const results: MetaCampaign[] = []
    for (let i = 0; i < campaignIds.length; i += MULTI_GET_CHUNK) {
      const chunk = campaignIds.slice(i, i + MULTI_GET_CHUNK)
      const response = await facebookAdsGraphClient.get<
        Record<string, unknown>
      >(endpoint, {
        searchParams: {
          ids: chunk.join(","),
          fields: CAMPAIGN_FIELDS,
          access_token: accessToken,
        },
      })
      for (const row of Object.values(response)) {
        results.push(campaignSchema.parse(row))
      }
    }
    return results
  })
}
