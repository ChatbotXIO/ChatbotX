import {
  facebookMarketingMessageRecipientRepository,
  facebookMarketingMessageRepository,
} from "@chatbotx.io/database/repositories"
import type {
  FacebookMarketingMessageModel,
  FacebookMarketingMessageRecipientModel,
} from "@chatbotx.io/database/types"
import { z } from "zod"
import { logger } from "../logger"

type RecipientModel = FacebookMarketingMessageRecipientModel

// Meta samples show ids/tokens as strings or numbers; coerce to string.
const idString = z
  .union([z.string(), z.number()])
  .transform(String)
  .pipe(z.string().min(1))

/** Value of a `marketing_message_*` Page webhook change. Unknown keys pass. */
export const marketingMessageWebhookValueSchema = z.looseObject({
  message_id: idString,
  messenger_subscription_token: idString,
  // unix seconds or ms (real echoes send ms, delivery_failed sends seconds);
  // null / "" / false must not coerce to 0
  timestamp: z
    .union([z.number(), z.string().min(1)])
    .transform(Number)
    .pipe(z.number().finite().positive()),
  marketing_message_tracking_id: idString.nullish(),
  recipient_id: idString.nullish(),
  mid: idString.nullish(),
  error_message: z.string().nullish(),
})

export type MarketingMessageWebhookValue = z.infer<
  typeof marketingMessageWebhookValueSchema
>

export type MarketingMessageWebhookEvent =
  | {
      field: "marketing_message_echoes" | "marketing_message_deliveries"
      campaignId: string
      subscriptionToken: string
      trackingId: string | null
      psid: string | null
      mid: string | null
      timestamp: Date
    }
  | {
      field: "marketing_message_delivery_failed"
      campaignId: string
      subscriptionToken: string
      errorMessage: string
      timestamp: Date
    }

/** Below 1e12 is seconds (1e12 s is year 33658; 1e12 ms is 2001). */
const toEpochMs = (ts: number): number => (ts < 1e12 ? ts * 1000 : ts)

const WEBHOOK_FIELDS = [
  "marketing_message_echoes",
  "marketing_message_deliveries",
  "marketing_message_delivery_failed",
] as const

/**
 * Maps a raw Page webhook change to an event. Unknown field or an invalid
 * value yields null (never throws).
 */
export function parseMarketingMessageWebhook(
  field: string,
  value: unknown,
): MarketingMessageWebhookEvent | null {
  const known = WEBHOOK_FIELDS.find((f) => f === field)
  if (!known) {
    return null
  }
  const parsed = marketingMessageWebhookValueSchema.safeParse(value)
  if (!parsed.success) {
    logger.debug(
      { field, issues: parsed.error.issues.map((i) => i.path.join(".")) },
      "invalid marketing message webhook value",
    )
    return null
  }
  const v = parsed.data
  const base = {
    campaignId: v.message_id,
    subscriptionToken: v.messenger_subscription_token,
    timestamp: new Date(toEpochMs(v.timestamp)),
  }
  if (known === "marketing_message_delivery_failed") {
    return {
      ...base,
      field: known,
      errorMessage: v.error_message || "deliveryFailed",
    }
  }
  return {
    ...base,
    field: known,
    trackingId: v.marketing_message_tracking_id ?? null,
    psid: v.recipient_id ?? null,
    mid: v.mid ?? null,
  }
}

export type ApplyWebhookResult = {
  applied: boolean
  campaign?: FacebookMarketingMessageModel
  recipient?: RecipientModel
}

const tail = (token: string) => token.slice(-6)

const isOutcomeUnknown = (r: RecipientModel) =>
  r.status === "failed" &&
  r.errorCode === null &&
  r.errorMessage === "outcomeUnknown"

const clearFailure = {
  errorCode: null,
  errorMessage: null,
  errorSource: null,
  failedAt: null,
} as const

async function findRecipient(
  campaign: FacebookMarketingMessageModel,
  event: MarketingMessageWebhookEvent,
): Promise<RecipientModel | null> {
  if (event.field !== "marketing_message_delivery_failed" && event.trackingId) {
    const byTracking =
      await facebookMarketingMessageRecipientRepository.findByTrackingId(
        event.trackingId,
      )
    if (byTracking && byTracking.campaignRowId === campaign.id) {
      return byTracking
    }
  }
  return await facebookMarketingMessageRecipientRepository.findByCampaignToken({
    campaignRowId: campaign.id,
    subscriptionToken: event.subscriptionToken,
  })
}

function buildPatch(
  recipient: RecipientModel,
  event: MarketingMessageWebhookEvent,
): Record<string, unknown> {
  if (event.field === "marketing_message_delivery_failed") {
    return {
      status: "failed",
      errorSource: "webhook",
      errorCode: null,
      errorMessage: event.errorMessage,
      failedAt: event.timestamp,
    }
  }
  const patch: Record<string, unknown> = {}
  if (event.psid && !recipient.psid) {
    patch.psid = event.psid
  }
  if (event.mid && !recipient.mid) {
    patch.mid = event.mid
  }
  if (event.trackingId && !recipient.trackingId) {
    patch.trackingId = event.trackingId
  }
  const promotable =
    recipient.status === "pending" ||
    recipient.status === "unconfirmed" ||
    isOutcomeUnknown(recipient)
  if (event.field === "marketing_message_echoes") {
    if (promotable) {
      patch.status = "sent"
      if (recipient.status === "failed") {
        Object.assign(patch, clearFailure)
      }
    }
  } else if (promotable || recipient.status === "sent") {
    patch.status = "delivered"
    patch.deliveredAt = event.timestamp
    if (recipient.status === "failed") {
      Object.assign(patch, clearFailure)
    }
  }
  return patch
}

export async function applyMarketingMessageWebhook(
  event: MarketingMessageWebhookEvent,
): Promise<ApplyWebhookResult> {
  const campaign = await facebookMarketingMessageRepository.findByCampaignId(
    event.campaignId,
  )
  if (!campaign) {
    logger.debug(
      { campaignId: event.campaignId, field: event.field },
      "marketing message webhook for unknown campaign",
    )
    return { applied: false }
  }
  const recipient = await findRecipient(campaign, event)
  if (!recipient) {
    logger.debug(
      {
        campaignRowId: campaign.id,
        tokenTail: tail(event.subscriptionToken),
        field: event.field,
      },
      "marketing message webhook for unknown token",
    )
    return { applied: false }
  }
  const patch = buildPatch(recipient, event)
  if (Object.keys(patch).length > 0) {
    await facebookMarketingMessageRecipientRepository.update({
      id: recipient.id,
      ...patch,
    })
  }
  return { applied: true, campaign, recipient: { ...recipient, ...patch } }
}
