import { isHTTPError, isTimeoutError } from "ky"
import { z } from "zod"
import { DEFAULT_API_VERSION } from "../constants"
import { redactTokens, rescue } from "../exception"
import { facebookAdsGraphClient } from "../lib/http-client"
import { facebookAdsLogger } from "../logger"

export type NotificationMessageToken = {
  token: string
  topicTitle: string | null
  psid: string | null
  nextEligibleAt: Date | null
  customAudienceIds: string[]
}

const tokensPageSchema = z.object({
  data: z
    .array(
      z.object({
        notification_messages_token: z.string().min(1),
        topic_title: z.string().nullish(),
        recipient_id: z.union([z.string(), z.number()]).nullish(),
        next_eligible_time: z.number().nullish(),
        custom_audience_ids: z
          .array(z.union([z.string(), z.number()]))
          .nullish(),
      }),
    )
    .default([]),
  paging: z.object({ next: z.string().nullish() }).nullish(),
})

/**
 * `GET /<PAGE_ID>/notification_message_tokens` (Page access token), following
 * `paging.next` until it is absent.
 */
export function listNotificationMessageTokens(input: {
  pageAccessToken: string
  pageId: string
  customAudienceId?: string
  version?: string
}): Promise<NotificationMessageToken[]> {
  const { version = DEFAULT_API_VERSION } = input
  const endpoint = `${version}/${input.pageId}/notification_message_tokens`

  return rescue(endpoint, async () => {
    const tokens: NotificationMessageToken[] = []
    const searchParams: Record<string, string> = {
      limit: "1000",
      access_token: input.pageAccessToken,
    }
    if (input.customAudienceId) {
      searchParams.custom_audience_ids = input.customAudienceId
    }

    // `paging.next` is an absolute URL that already carries every query param.
    let url: string | undefined = endpoint
    let first = true
    while (url) {
      const response: unknown = await facebookAdsGraphClient.get<unknown>(
        url,
        first ? { searchParams } : undefined,
      )
      first = false
      const page = tokensPageSchema.parse(response)
      for (const row of page.data) {
        tokens.push({
          token: row.notification_messages_token,
          topicTitle: row.topic_title ?? null,
          psid:
            row.recipient_id === null || row.recipient_id === undefined
              ? null
              : String(row.recipient_id),
          nextEligibleAt:
            typeof row.next_eligible_time === "number"
              ? new Date(row.next_eligible_time * 1000)
              : null,
          customAudienceIds: (row.custom_audience_ids ?? []).map(String),
        })
      }
      url = page.paging?.next ?? undefined
    }
    return tokens
  })
}

export type SendMarketingMessageResult =
  | { ok: true; trackingId: string }
  | {
      ok: false
      kind: "meta"
      code: number | null
      subcode: number | null
      /** HTTP status of the error response (lets a code-less 429 retry). */
      httpStatus: number
      message: string
    }
  | { ok: false; kind: "uncertain"; message: string }

const sendResponseSchema = z.object({
  marketing_message_tracking_id: z.union([z.string(), z.number()]),
})

type GraphErrorBody = {
  error?: { code?: unknown; error_subcode?: unknown; message?: unknown }
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

// A request timeout may have reached Meta, like a 5xx.
const HTTP_REQUEST_TIMEOUT = 408

/**
 * `POST /act_<AD_ACCOUNT_ID>/messages`. NEVER retried and NEVER throws for
 * Meta/HTTP/network errors: a 5xx, 408, timeout or network failure may have
 * delivered the message, so it is `uncertain` (the caller must not re-send).
 */
export async function sendMarketingMessage(input: {
  accessToken: string
  adAccountId: string
  campaignId: string
  subscriptionToken: string
  message: Record<string, unknown>
  version?: string
}): Promise<SendMarketingMessageResult> {
  const { version = DEFAULT_API_VERSION } = input
  const accountId = input.adAccountId.startsWith("act_")
    ? input.adAccountId
    : `act_${input.adAccountId}`
  const endpoint = `${version}/${accountId}/messages`

  try {
    const response = await facebookAdsGraphClient.postJsonFields<unknown>(
      endpoint,
      {
        access_token: input.accessToken,
        message_id: input.campaignId,
        messenger_delivery_data: {
          subscription_token: input.subscriptionToken,
        },
        message: input.message,
      },
    )
    const parsed = sendResponseSchema.safeParse(response)
    if (!parsed.success) {
      // 2xx without a tracking id: the send was accepted, outcome unknowable.
      return {
        ok: false,
        kind: "uncertain",
        message: "Meta accepted the request but returned no tracking id",
      }
    }
    return {
      ok: true,
      trackingId: String(parsed.data.marketing_message_tracking_id),
    }
  } catch (error) {
    const status = isHTTPError(error) ? error.response.status : undefined
    facebookAdsLogger.warn(
      { endpoint, status },
      "Marketing message send failed",
    )

    if (
      isHTTPError(error) &&
      error.response.status < 500 &&
      error.response.status !== HTTP_REQUEST_TIMEOUT
    ) {
      const body = (
        typeof error.data === "object" && error.data !== null ? error.data : {}
      ) as GraphErrorBody
      const message =
        typeof body.error?.message === "string"
          ? body.error.message
          : `HTTP ${error.response.status}`
      return {
        ok: false,
        kind: "meta",
        code: numberOrNull(body.error?.code),
        subcode: numberOrNull(body.error?.error_subcode),
        httpStatus: error.response.status,
        message: redactTokens(message),
      }
    }

    let message = "Unknown error"
    if (isTimeoutError(error)) {
      message = "Request timed out"
    } else if (error instanceof Error) {
      message = error.message
    }
    return {
      ok: false,
      kind: "uncertain",
      message: redactTokens(
        status === undefined ? message : `HTTP ${status}: ${message}`,
      ),
    }
  }
}

const estimateSchema = z.object({
  data: z
    .array(
      z.object({
        estimate_delivery_lower_bound: z.number(),
        estimate_delivery_upper_bound: z.number(),
      }),
    )
    .min(1),
})

/**
 * `GET /act_<AD_ACCOUNT_ID>/message_delivery_estimate` for a direct-send
 * Marketing Messages campaign — how many recipients a daily budget can reach.
 */
export function getMessageDeliveryEstimate(input: {
  accessToken: string
  adAccountId: string
  pageId: string
  dailyBudgetMinorUnits: number
  version?: string
}): Promise<{ deliveryLower: number; deliveryUpper: number }> {
  const { version = DEFAULT_API_VERSION } = input
  const accountId = input.adAccountId.startsWith("act_")
    ? input.adAccountId
    : `act_${input.adAccountId}`
  const endpoint = `${version}/${accountId}/message_delivery_estimate`

  return rescue(endpoint, async () => {
    const response = await facebookAdsGraphClient.get<unknown>(endpoint, {
      searchParams: {
        access_token: input.accessToken,
        fields: "estimate_delivery_lower_bound,estimate_delivery_upper_bound",
        targeting_spec: JSON.stringify({
          messenger_positions: ["marketing_messages"],
          publisher_platforms: ["messenger"],
        }),
        promoted_object: JSON.stringify({ page_id: input.pageId }),
        daily_budget: String(input.dailyBudgetMinorUnits),
        is_direct_send_campaign: "true",
        pacing_type: "no_pacing",
      },
    })
    const first = estimateSchema.parse(response).data[0]
    return {
      deliveryLower: first?.estimate_delivery_lower_bound ?? 0,
      deliveryUpper: first?.estimate_delivery_upper_bound ?? 0,
    }
  })
}

const scheduleSchema = z.object({
  adset: z.object({
    id: z.string().trim().min(1),
    end_time: z.string().nullish(),
  }),
})

/** `GET /<CAMPAIGN_ID>?fields=adset{id,end_time}` — the ad set id and Meta's end time. */
export function getMessageCampaignSchedule(input: {
  accessToken: string
  campaignId: string
  version?: string
}): Promise<{ adSetId: string; endTime: Date | null }> {
  const { version = DEFAULT_API_VERSION } = input
  const endpoint = `${version}/${input.campaignId}`

  return rescue(endpoint, async () => {
    const response = await facebookAdsGraphClient.get<unknown>(endpoint, {
      searchParams: {
        access_token: input.accessToken,
        fields: "adset{id,end_time}",
      },
    })
    const { adset } = scheduleSchema.parse(response)
    const endTime = adset.end_time ? new Date(adset.end_time) : null
    return {
      adSetId: adset.id,
      endTime: endTime && !Number.isNaN(endTime.getTime()) ? endTime : null,
    }
  })
}

/** `DELETE /<CAMPAIGN_ID>`. Throws `FacebookAdsException` on failure. */
export function deleteMessageCampaign(input: {
  accessToken: string
  campaignId: string
  version?: string
}): Promise<void> {
  const { version = DEFAULT_API_VERSION } = input
  const endpoint = `${version}/${input.campaignId}`

  return rescue(endpoint, async () => {
    await facebookAdsGraphClient.delete<unknown>(endpoint, {
      searchParams: { access_token: input.accessToken },
    })
  })
}
