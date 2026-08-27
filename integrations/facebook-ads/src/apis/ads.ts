import { z } from "zod"
import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { facebookAdsGraphClient } from "../lib/http-client"
import { META_STATUS } from "../messaging-ads/constants"
import type { CreateAdInput, MetaAd } from "../messaging-ads/types"

const AD_FIELDS = "id,name,status,effective_status"

const adSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().optional(),
  status: z.string().optional(),
  effective_status: z.string().optional(),
})

/** Meta CREATE endpoints return ONLY `{ id }` — never require name/status here. */
const createResponseSchema = z.object({ id: z.string().trim().min(1) })

/** `POST /act_{adAccount}/ads` — always created PAUSED, referencing an already-created creative. */
export function createAd({
  accessToken,
  adAccountId,
  name,
  adSetId,
  creativeId,
  version = DEFAULT_API_VERSION,
}: CreateAdInput): Promise<MetaAd> {
  const endpoint = `${version}/${adAccountId}/ads`

  return rescue(endpoint, async () => {
    const response = await facebookAdsGraphClient.postJsonFields<unknown>(
      endpoint,
      {
        access_token: accessToken,
        name,
        adset_id: adSetId,
        creative: { creative_id: creativeId },
        status: META_STATUS.paused,
      },
    )
    return createResponseSchema.parse(response)
  })
}

export function updateAdStatus(input: {
  accessToken: string
  adId: string
  status: (typeof META_STATUS)[keyof typeof META_STATUS]
  version?: string
}): Promise<void> {
  const { accessToken, adId, status, version = DEFAULT_API_VERSION } = input
  const endpoint = `${version}/${adId}`

  return rescue(endpoint, async () => {
    await facebookAdsGraphClient.postJsonFields<unknown>(endpoint, {
      access_token: accessToken,
      status,
    })
  })
}

/** Batch-reads `effective_status` for the ads list view (Meta is the source of truth, never the DB's configured status). */
export function listAdsByIds(input: {
  accessToken: string
  adIds: string[]
  version?: string
}): Promise<MetaAd[]> {
  const { accessToken, adIds, version = DEFAULT_API_VERSION } = input
  if (adIds.length === 0) {
    return Promise.resolve([])
  }
  const endpoint = `${version}`

  return rescue(endpoint, async () => {
    const response = await facebookAdsGraphClient.get<Record<string, unknown>>(
      endpoint,
      {
        searchParams: {
          ids: adIds.join(","),
          fields: AD_FIELDS,
          access_token: accessToken,
        },
      },
    )
    return Object.values(response).map((row) => adSchema.parse(row))
  })
}
