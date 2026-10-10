import {
  googleAdsCustomerTypes,
  googleAdsCustomerValueBuckets,
} from "@chatbotx.io/utils/google-click"
import { containsVariablePlaceholder } from "@chatbotx.io/utils/variables"
import { z } from "zod"

// Client-safe (no drizzle): the builder imports these through
// `@chatbotx.io/database/partials`; `schema/*` builds the `pgEnum`s from them.

// The supported channel list lives in `@chatbotx.io/utils/google-click`
// (re-exported like `channelTypes`); the table stores a plain `ChannelType`.
export {
  GOOGLE_ADS_CHANNEL_VALUES,
  type GoogleAdsChannel,
  googleAdsChannels,
} from "@chatbotx.io/utils/google-click"
/** Largest page the event-history list serves; shared by the repository and the API schema. */
export const GOOGLE_ADS_EVENTS_MAX_PER_PAGE = 100
export const googleAdsEventSourceValues = ["flowStep", "triggerAction"] as const
export const googleAdsClickIdTypeValues = ["gclid", "gbraid"] as const
export const googleAdsEventStatusValues = [
  "pending",
  "sending",
  "sent",
  "processed",
  "failed",
  "skipped_no_account",
  "skipped_expired",
] as const
export const googleAdsProcessingStatusValues = [
  "processing",
  "success",
  "partial_success",
  "failed",
  "unknown",
  "timed_out",
] as const
export const googleAdsFailureStageValues = [
  "delivery",
  "processing",
  "timeout",
] as const

/** How a conversion reaches Google: Data Manager `events:ingest` or the legacy `uploadClickConversions`. */
export const googleAdsUploadMethodValues = ["dataManager", "legacy"] as const
export const googleAdsUploadMethodSchema = z.enum(googleAdsUploadMethodValues)
export type GoogleAdsUploadMethod = z.infer<typeof googleAdsUploadMethodSchema>
/** What an absent method (credential saved, connection or event recorded before the choice existed) means. */
export const DEFAULT_GOOGLE_ADS_UPLOAD_METHOD: GoogleAdsUploadMethod =
  "dataManager"

export const googleAdsEventSourceSchema = z.enum(googleAdsEventSourceValues)
export type GoogleAdsEventSource = z.infer<typeof googleAdsEventSourceSchema>

export const googleAdsClickIdTypeSchema = z.enum(googleAdsClickIdTypeValues)
export type GoogleAdsClickIdType = z.infer<typeof googleAdsClickIdTypeSchema>

export const googleAdsEventStatusSchema = z.enum(googleAdsEventStatusValues)
export type GoogleAdsEventStatus = z.infer<typeof googleAdsEventStatusSchema>

export const googleAdsProcessingStatusSchema = z.enum(
  googleAdsProcessingStatusValues,
)
export type GoogleAdsProcessingStatus = z.infer<
  typeof googleAdsProcessingStatusSchema
>

export const googleAdsFailureStageSchema = z.enum(googleAdsFailureStageValues)
export type GoogleAdsFailureStage = z.infer<typeof googleAdsFailureStageSchema>

/** Stable codes for why the Google Ads setup (post-connect) is not ready. */
export const googleAdsSetupErrorSchema = z.enum([
  "conversion_customer_inaccessible",
  "customer_data_terms_not_accepted",
  "sync_failed",
  "developer_token_missing",
])
export type GoogleAdsSetupError = z.infer<typeof googleAdsSetupErrorSchema>

export const googleAdsConversionActionCacheEntrySchema = z.object({
  id: z.string(),
  resourceName: z.string(),
  name: z.string(),
  category: z.string(),
  status: z.string(),
  countingType: z.string(),
  clickThroughLookbackWindowDays: z.number().int().nullable(),
  /**
   * `AttributionModel` enum name (`EXTERNAL` = third-party attribution, which
   * Data Manager cannot ingest). Absent in entries cached before it was read;
   * zod/TS only (jsonb), no migration.
   */
  attributionModel: z.string().nullable().optional(),
})
export type GoogleAdsConversionActionCacheEntry = z.infer<
  typeof googleAdsConversionActionCacheEntrySchema
>

/**
 * Allowlisted diagnostics kept on an event (jsonb, no migration). The status
 * fields come from a Data Manager poll; the two flags are ours:
 * `sendAttemptedAt` is stamped (lease-fenced) just before a legacy upload and
 * survives a redrive, so a later duplicate-class answer can be told apart from
 * a first attempt; `duplicateRecovery` marks an event (legacy upload or Data
 * Manager poll) completed because Google already held it.
 */
export const googleAdsProcessingDetailSchema = z.object({
  requestStatus: z.string().optional(),
  recordCount: z.number().int().nullable().optional(),
  errorCounts: z
    .array(z.object({ reason: z.string(), recordCount: z.number().int() }))
    .optional(),
  warningCounts: z
    .array(z.object({ reason: z.string(), recordCount: z.number().int() }))
    .optional(),
  sendAttemptedAt: z.string().optional(),
  duplicateRecovery: z.boolean().optional(),
})
export type GoogleAdsProcessingDetail = z.infer<
  typeof googleAdsProcessingDetailSchema
>

/**
 * One consent setting's source: a fixed answer, a contact-field template
 * resolved per conversion, or "not provided" (the field is left out of the
 * upload). Messages are i18n keys resolved by the builder.
 */
export const googleAdsConsentSourceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("notProvided") }),
  z.object({ type: z.literal("granted") }),
  z.object({ type: z.literal("denied") }),
  z.object({
    type: z.literal("variable"),
    template: z
      .string()
      .trim()
      .min(1, "googleAds.consent.validation.templateRequired")
      .max(200, "googleAds.consent.validation.templateTooLong")
      .refine(
        containsVariablePlaceholder,
        "googleAds.consent.validation.templateRequired",
      ),
  }),
])
export type GoogleAdsConsentSource = z.infer<
  typeof googleAdsConsentSourceSchema
>

/** The form / action / service shape: unwrapped, no version. */
export const googleAdsConsentSchema = z.object({
  adUserData: googleAdsConsentSourceSchema,
  adPersonalization: googleAdsConsentSourceSchema,
})
export type GoogleAdsConsent = z.infer<typeof googleAdsConsentSchema>

/** The stored document; future options are new optional keys or a v2. */
export const googleAdsSettingsV1Schema = z.object({
  version: z.literal(1),
  consent: googleAdsConsentSchema,
})
export const googleAdsSettingsDocumentSchema = z.discriminatedUnion("version", [
  googleAdsSettingsV1Schema,
])
export type GoogleAdsSettingsDocument = z.infer<
  typeof googleAdsSettingsDocumentSchema
>

export const NOT_PROVIDED_CONSENT = {
  adUserData: { type: "notProvided" },
  adPersonalization: { type: "notProvided" },
} as const satisfies GoogleAdsConsent

/**
 * Dedup policy of a conversion: one per ad click, one per business ID, or one
 * per occurrence (every run of the producer, stable across its retries).
 */
export const googleAdsIdentityPolicyValues = ["click", "id", "event"] as const
export type GoogleAdsIdentityPolicy =
  (typeof googleAdsIdentityPolicyValues)[number]

const GOOGLE_ADS_DEDUP_ID_MAX_LENGTH = 64

const identitySnapshotSchema = z.object({
  version: z.literal(1),
  configuredPolicy: z.enum(googleAdsIdentityPolicyValues),
  // Equal to `configuredPolicy` today (no fallback); kept for future modes.
  effectivePolicy: z.enum(googleAdsIdentityPolicyValues),
  keySource: z.enum(["click", "explicit", "occurrence"]),
  // Resolved business ID in `id` mode, else null (the occurrence key is never stored).
  id: z.string().min(1).max(GOOGLE_ADS_DEDUP_ID_MAX_LENGTH).nullable(),
})

const consentSnapshotEntrySchema = z.object({
  // null = omitted from the upload.
  status: z.enum(["granted", "denied"]).nullable(),
  source: z.enum(["notProvided", "fixed", "variable"]),
})

/** Immutable per-event snapshot of how it was identified, timed and consented. */
export const googleAdsEventOptionsV1Schema = z.object({
  version: z.literal(1),
  identity: identitySnapshotSchema,
  timeSource: z.enum(["recorded", "provided"]),
  consent: z.object({
    adUserData: consentSnapshotEntrySchema,
    adPersonalization: consentSnapshotEntrySchema,
  }),
})

/**
 * Customer matching as recorded: the CONFIGURATION (the `{{variable}}` of each
 * identifier, never a value or a hash; those are resolved from the contact and
 * hashed again at delivery) and whether it can be sent. `null` = that
 * identifier is not configured.
 */
const matchTemplateSnapshotSchema = z.string().min(1).max(200).nullable()

export const googleAdsMatchingSnapshotSchema = z.object({
  status: z.enum(["enabled", "withheldConsent", "unsupportedTransport"]),
  email: matchTemplateSnapshotSchema,
  phone: matchTemplateSnapshotSchema,
})
export type GoogleAdsMatchingSnapshot = z.infer<
  typeof googleAdsMatchingSnapshotSchema
>

/**
 * Customer properties as recorded: the RESOLVED values (advertiser
 * assessments such as NEW / HIGH, not personal data) and whether they will be
 * sent. `null` = not set.
 */
export const googleAdsCustomerPropertiesSnapshotSchema = z.object({
  status: z.enum(["enabled", "withheldConsent", "unsupportedTransport"]),
  customerType: googleAdsCustomerTypes.nullable(),
  customerValueBucket: googleAdsCustomerValueBuckets.nullable(),
})
export type GoogleAdsCustomerPropertiesSnapshot = z.infer<
  typeof googleAdsCustomerPropertiesSnapshotSchema
>

/** v1 plus the optional enrichment settings; written only when one is configured. */
export const googleAdsEventOptionsV2Schema =
  googleAdsEventOptionsV1Schema.extend({
    version: z.literal(2),
    matching: googleAdsMatchingSnapshotSchema.optional(),
    customerProperties: googleAdsCustomerPropertiesSnapshotSchema.optional(),
  })

export const googleAdsEventOptionsSchema = z.discriminatedUnion("version", [
  googleAdsEventOptionsV1Schema,
  googleAdsEventOptionsV2Schema,
])
export type GoogleAdsEventOptions = z.infer<typeof googleAdsEventOptionsSchema>
