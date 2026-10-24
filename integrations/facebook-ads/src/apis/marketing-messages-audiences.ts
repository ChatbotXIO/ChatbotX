import { z } from "zod"
import { ADS_PAGE_LIMIT, DEFAULT_API_VERSION } from "../constants"
import { FacebookAdsException, rescue } from "../exception"
import { facebookAdsGraphClient } from "../lib/http-client"
import { fetchAllPages } from "./ad-accounts"

/** `data_source.subtype` of a Messenger Marketing Messages audience. */
export const MARKETING_MESSAGES_AUDIENCE_SUBTYPE = 1010
/** Meta's per-request cap for `/{audience}/users`. */
export const AUDIENCE_UPLOAD_BATCH_SIZE = 10_000

// Graph's default create response is `{ id }`; the Marketing Messages guide
// shows `{ data: [{ id }] }`. Accept both (spec D26).
const createResponseSchema = z.union([
  z.object({ id: z.string().trim().min(1) }),
  z
    .object({
      data: z.array(z.object({ id: z.string().trim().min(1) })).min(1),
    })
    .transform((value) => ({ id: value.data[0]?.id ?? "" })),
])

export function createMarketingMessagesAudience({
  accessToken,
  adAccountId,
  pageId,
  name,
  description,
  version = DEFAULT_API_VERSION,
}: {
  accessToken: string
  adAccountId: string
  pageId: string
  name: string
  description?: string | null
  version?: string
}): Promise<{ id: string }> {
  const endpoint = `${version}/${adAccountId}/customaudiences`
  return rescue(endpoint, async () => {
    const response = await facebookAdsGraphClient.post<unknown>(endpoint, {
      searchParams: { access_token: accessToken },
      json: {
        subtype: "CUSTOM",
        customer_file_source: "USER_PROVIDED_ONLY",
        name,
        ...(description ? { description } : {}),
        use_for_products: ["MARKETING_MESSAGES"],
        subscription_info: ["MESSENGER"],
        marketing_message_channels: { MESSENGER: pageId },
      },
    })
    return createResponseSchema.parse(response)
  })
}

/** A batch failed mid-session; carries what Meta accepted before it. */
export class AudienceUploadError extends Error {
  readonly received: number
  readonly invalid: number

  constructor(received: number, invalid: number, cause: unknown) {
    super(cause instanceof Error ? cause.message : "Audience upload failed", {
      cause,
    })
    this.name = "AudienceUploadError"
    this.received = received
    this.invalid = invalid
  }
}

const uploadResponseSchema = z.object({
  num_received: z.number().optional(),
  num_invalid_entries: z.number().optional(),
})

// int64 on Meta's side, but JSON numbers are only exact to 2^53.
const randomSessionId = () =>
  Math.floor(Math.random() * (Number.MAX_SAFE_INTEGER - 1)) + 1

export async function uploadAudienceUsersSession({
  accessToken,
  customAudienceId,
  schema,
  data,
  version = DEFAULT_API_VERSION,
  sessionId = randomSessionId(),
}: {
  accessToken: string
  customAudienceId: string
  schema: readonly string[]
  data: string[][]
  version?: string
  sessionId?: number
}): Promise<{ received: number; invalid: number }> {
  const endpoint = `${version}/${customAudienceId}/users`
  const batchCount = Math.ceil(data.length / AUDIENCE_UPLOAD_BATCH_SIZE)
  let received = 0
  let invalid = 0

  for (let batch = 0; batch < batchCount; batch++) {
    const start = batch * AUDIENCE_UPLOAD_BATCH_SIZE
    try {
      const response = await rescue(endpoint, () =>
        facebookAdsGraphClient.post<unknown>(endpoint, {
          searchParams: { access_token: accessToken },
          json: {
            payload: {
              schema,
              data: data.slice(start, start + AUDIENCE_UPLOAD_BATCH_SIZE),
            },
            session: {
              session_id: sessionId,
              batch_seq: batch + 1,
              last_batch_flag: batch === batchCount - 1,
              estimated_num_total: data.length,
            },
          },
        }),
      )
      const parsed = uploadResponseSchema.parse(response)
      received += parsed.num_received ?? 0
      invalid += parsed.num_invalid_entries ?? 0
    } catch (error) {
      throw new AudienceUploadError(received, invalid, error)
    }
  }

  return { received, invalid }
}

export type MarketingMessagesAudienceStatus = {
  code: number
  description: string
}

export type MarketingMessagesAudience = {
  id: string
  name: string
  description: string | null
  deliveryStatus: MarketingMessagesAudienceStatus | null
  operationStatus: MarketingMessagesAudienceStatus | null
  approximateCountLowerBound: number | null
  approximateCountUpperBound: number | null
  pageId: string | null
}

type GraphAudience = {
  id: string
  name?: string
  description?: string
  delivery_status?: { code?: number; description?: string }
  operation_status?: { code?: number; description?: string }
  approximate_count_lower_bound?: number
  approximate_count_upper_bound?: number
  messenger_marketing_messages_page?: { id?: string } | null
}

const toStatus = (value?: {
  code?: number
  description?: string
}): MarketingMessagesAudienceStatus | null =>
  typeof value?.code === "number"
    ? { code: value.code, description: value.description ?? "" }
    : null

export function getMarketingMessagesAudiences({
  accessToken,
  adAccountId,
  version = DEFAULT_API_VERSION,
}: {
  accessToken: string
  adAccountId: string
  version?: string
}): Promise<MarketingMessagesAudience[]> {
  const endpoint = `${version}/${adAccountId}/customaudiences`
  return rescue(endpoint, async () => {
    const rows = await fetchAllPages<GraphAudience>(endpoint, {
      fields:
        "id,name,subtype,description,delivery_status,operation_status,approximate_count_lower_bound,approximate_count_upper_bound,messenger_marketing_messages_page",
      filtering: JSON.stringify([
        {
          field: "data_source.subtype",
          operator: "IN",
          value: [MARKETING_MESSAGES_AUDIENCE_SUBTYPE],
        },
      ]),
      limit: String(ADS_PAGE_LIMIT),
      access_token: accessToken,
    })
    return rows.map((row) => ({
      id: row.id,
      name: row.name ?? row.id,
      description: row.description ?? null,
      deliveryStatus: toStatus(row.delivery_status),
      operationStatus: toStatus(row.operation_status),
      approximateCountLowerBound: row.approximate_count_lower_bound ?? null,
      approximateCountUpperBound: row.approximate_count_upper_bound ?? null,
      pageId: row.messenger_marketing_messages_page?.id ?? null,
    }))
  })
}

// Graph answers code 100 / subcode 33 for an object that no longer exists.
const isObjectMissing = (error: unknown) =>
  error instanceof FacebookAdsException &&
  error.code === 100 &&
  String(error.subCode) === "33"

export async function deleteCustomAudience({
  accessToken,
  customAudienceId,
  version = DEFAULT_API_VERSION,
}: {
  accessToken: string
  customAudienceId: string
  version?: string
}): Promise<{ status: "deleted" | "notFound" }> {
  const endpoint = `${version}/${customAudienceId}`
  try {
    await rescue(endpoint, () =>
      facebookAdsGraphClient.delete<unknown>(endpoint, {
        searchParams: { access_token: accessToken },
      }),
    )
    return { status: "deleted" }
  } catch (error) {
    if (isObjectMissing(error)) {
      return { status: "notFound" }
    }
    throw error
  }
}

const tokensResponseSchema = z.object({
  data: z
    .array(
      z.object({
        custom_audience_ids: z
          .array(z.union([z.string(), z.number()]))
          .optional(),
      }),
    )
    .default([]),
})

/**
 * Called as the Page (Page access token). Meta only returns tokens for an
 * audience once at least 100 users matched, so an empty list means "not
 * ready yet", not an error.
 */
export function getNotificationMessageTokenAudienceIds({
  pageAccessToken,
  pageId,
  customAudienceId,
  version = DEFAULT_API_VERSION,
}: {
  pageAccessToken: string
  pageId: string
  customAudienceId: string
  version?: string
}): Promise<string[]> {
  const endpoint = `${version}/${pageId}/notification_message_tokens`
  return rescue(endpoint, async () => {
    const response = await facebookAdsGraphClient.get<unknown>(endpoint, {
      searchParams: {
        custom_audience_ids: customAudienceId,
        limit: "1",
        access_token: pageAccessToken,
      },
    })
    const parsed = tokensResponseSchema.parse(response)
    return (parsed.data[0]?.custom_audience_ids ?? []).map(String)
  })
}
