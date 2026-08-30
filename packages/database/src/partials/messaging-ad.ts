import { z } from "zod"

/**
 * Channels the in-app messaging-ads manager (CTM/CTID/CTWA) supports. Same
 * value set as `adsEligibleChannelTypes` (`@chatbotx.io/utils/channel`), kept
 * as its own enum here (rather than importing it) because this package
 * cannot depend on `@chatbotx.io/utils` for a DB-level Postgres enum — see
 * `channelTypes`'s own doc comment for why the reverse direction (utils ->
 * database re-export) is the one that exists.
 */
export const messagingAdChannelTypes = z.enum([
  "whatsapp",
  "messenger",
  "instagram",
])
export type MessagingAdChannel = z.infer<typeof messagingAdChannelTypes>

/**
 * Furthest completed step of the durable create-with-reconcile flow
 * (campaign -> ad set -> ad creative -> ad, out/plan/ctm-ctid-ads-manager.md
 * "Durable operation model"). Monotonic — never regresses except to
 * `failed`.
 */
export const messagingAdCreateStateValues = [
  "pending",
  "campaignCreated",
  "adSetCreated",
  "creativeCreated",
  "adCreated",
  "failed",
] as const
export const messagingAdCreateStateSchema = z.enum(messagingAdCreateStateValues)
export type MessagingAdCreateState = z.infer<
  typeof messagingAdCreateStateSchema
>

/** Meta delivery/lifecycle control state we last drove — the LIST view still re-reads Meta's own `effective_status` on top of this. */
export const messagingAdPublishStateValues = [
  "draft",
  "publishing",
  "published",
  "pausing",
  "paused",
  "deleting",
  "deleted",
  "publishFailed",
] as const
export const messagingAdPublishStateSchema = z.enum(
  messagingAdPublishStateValues,
)
export type MessagingAdPublishState = z.infer<
  typeof messagingAdPublishStateSchema
>

// ---------------------------------------------------------------------------
// Persisted wizard input snapshot — NOT a mirror of Meta's data (budget,
// creative, targeting are re-read live from Meta for display). Persisted so a
// resumed/retried operation can replay the exact same create payload without
// re-asking the user, and so reconcile-by-query has the values it needs to
// tag Graph objects with the same correlation name.
// ---------------------------------------------------------------------------

export type MessagingAdTargetingInput = {
  countries: string[]
  ageMin?: number
  ageMax?: number
  genders?: (1 | 2)[]
  locales?: number[]
}

export type MessagingAdWelcomeMessageInput =
  | { type: "default" }
  | { type: "single"; message: string; quickReplies?: { title: string }[] }
  | {
      type: "templates"
      templates: {
        heading?: string
        message: string
        quickReplies?: { title: string }[]
      }[]
    }

/**
 * LEGACY shape — rows persisted before the presigned-S3 upload switch. Meta's
 * `image_hash` was uploaded to the ad-account image library at WIZARD time and
 * persisted directly. Kept readable (never written by new code) so an
 * old, un-retried draft can still publish — see `isLegacyImageMedia`.
 */
export type LegacyImageMediaInput = {
  kind: "image"
  imageHash: string
  link: string
  message?: string
  headline?: string
  description?: string
  caption?: string
}

/**
 * CURRENT shape — the browser uploads straight to our own object storage via
 * a presigned URL; only the S3 key + the `File` row id (ownership proof) are
 * persisted here. `imageMimeType`/`imageFileName` are CLIENT-DECLARED and
 * informational only — never trusted for any security or Meta-upload
 * decision. The authoritative MIME + a server-generated safe filename are
 * derived from the bytes themselves at create time (see
 * `resolveStoredImageBytes` in `@chatbotx.io/business`).
 */
export type StoredImageMediaInput = {
  kind: "image"
  imageKey: string
  fileId: string
  imageMimeType?: string
  imageFileName?: string
  link: string
  message?: string
  headline?: string
  description?: string
  caption?: string
}

export type VideoMediaInput = {
  kind: "video"
  videoId: string
  thumbnailImageHash?: string
  title?: string
  message?: string
  linkDescription?: string
}

/**
 * `MessagingAdCreativeMediaInput` is a plain TypeScript union — the jsonb
 * column is NOT re-validated by zod on read, so a persisted row can be either
 * image shape. Both image variants share the `kind: "image"` discriminant
 * (their extra fields differ), so narrowing between them needs the `in`-based
 * type guards below rather than `kind` alone.
 */
export type MessagingAdCreativeMediaInput =
  | LegacyImageMediaInput
  | StoredImageMediaInput
  | VideoMediaInput

export function isLegacyImageMedia(
  media: MessagingAdCreativeMediaInput,
): media is LegacyImageMediaInput {
  return media.kind === "image" && "imageHash" in media
}

export function isStoredImageMedia(
  media: MessagingAdCreativeMediaInput,
): media is StoredImageMediaInput {
  return media.kind === "image" && "imageKey" in media
}

export type MessagingAdOperationInput = {
  adAccountId: string
  /**
   * CTWA only: the connected Messenger Page integration that supplies `page_id`
   * for the WhatsApp `promoted_object`. Persisted so a retried/resumed WhatsApp
   * operation can re-resolve the same Page without a full wizard resubmission.
   */
  whatsappPageIntegrationId?: string
  campaign: {
    name: string
    specialAdCategories: string[]
    specialAdCategoryCountry?: string[]
  }
  adSet: {
    dailyBudgetMinorUnits: number
    targeting: MessagingAdTargetingInput
    startTime?: string
    endTime?: string
  }
  creative: {
    media: MessagingAdCreativeMediaInput
    welcomeMessage: MessagingAdWelcomeMessageInput
  }
}
