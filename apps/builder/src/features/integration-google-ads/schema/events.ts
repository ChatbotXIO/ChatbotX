import {
  googleAdsClickIdTypeSchema,
  googleAdsEventStatusSchema,
  googleAdsFailureStageSchema,
  googleAdsProcessingStatusSchema,
  googleAdsUploadMethodSchema,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import {
  googleAdsChannels,
  googleAdsCustomerTypes,
  googleAdsCustomerValueBuckets,
} from "@chatbotx.io/utils/google-click"
import { z } from "zod"

const DEFAULT_PER_PAGE = 20
const CONVERSION_ACTION_ID_PATTERN = /^\d+$/

export const conversionActionIdFilter = z
  .string()
  .regex(CONVERSION_ACTION_ID_PATTERN, "Conversion action id must be numeric")

export const getInFlightConnectSessionRequest = z.object({
  workspaceId: zodBigintAsString(),
})

/** `id` + `status` only: the picker then reads the session through the generic connections API. */
export const inFlightConnectSessionResource = z.object({
  session: z.object({ id: z.string(), status: z.string() }).nullable(),
})

export const listGoogleAdsEventsRequest = z.object({
  workspaceId: zodBigintAsString(),
  status: googleAdsEventStatusSchema.optional(),
  channel: googleAdsChannels.optional(),
  conversionActionId: conversionActionIdFilter.optional(),
  since: z.coerce.date().optional(),
  until: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  // Oversized values are clamped by the handler rather than rejected.
  perPage: z.coerce.number().int().min(1).default(DEFAULT_PER_PAGE),
})

const consentStatusSchema = z.enum([
  "granted",
  "denied",
  "notProvided",
  "notSupported",
])

/**
 * Event history row. Deliberately omits claimToken, requestId, transactionId,
 * attempt counters and the full click id (only a masked form is exposed).
 */
export const googleAdsEventResource = z.object({
  id: z.string().describe("Event ID."),
  status: googleAdsEventStatusSchema.describe(
    "Delivery status. `processed` means Google confirmed it; `sent` is still being processed by Google.",
  ),
  failureStage: googleAdsFailureStageSchema
    .nullable()
    .describe("Stage a failed event failed at; null otherwise."),
  processingStatus: googleAdsProcessingStatusSchema
    .nullable()
    .describe("Google's processing result for Data Manager uploads."),
  error: z
    .string()
    .nullable()
    .describe(
      "Sanitized Google error text for a failed event; click, transaction and request IDs are redacted.",
    ),
  // Stored as plain text; the producer (not the table) limits channels.
  channel: z.string().describe("Channel the conversion came from."),
  conversionActionId: z.string().describe("Google conversion action ID."),
  conversionActionName: z
    .string()
    .nullable()
    .describe("Conversion action name when the event was recorded."),
  uploadMethod: googleAdsUploadMethodSchema.describe(
    "Upload method used for this event.",
  ),
  clickIdType: googleAdsClickIdTypeSchema.describe("Kind of Google click ID."),
  maskedClickId: z
    .string()
    .describe(
      "Click ID with the middle masked; the full ID is never returned.",
    ),
  occurredAt: z.date().describe("When the conversion happened."),
  sentAt: z.date().nullable().describe("When it was sent to Google."),
  value: z.string().nullable().describe("Conversion value as a decimal."),
  currency: z.string().nullable().describe("Value currency (ISO 4217)."),
  // Snapshot of the event's `options`; null on rows that predate them.
  identity: z
    .object({
      mode: z
        .enum(["click", "id", "event"])
        .describe(
          "How the conversion is identified: by click ID, by order or event ID, or once per run (`event`).",
        ),
      id: z
        .string()
        .nullable()
        .describe(
          "The order or event ID sent to Google; may contain customer data.",
        ),
    })
    .nullable()
    .describe("Identity snapshot; null on events recorded before options."),
  conversionTimeProvided: z
    .boolean()
    .describe("True when the flow set the conversion time explicitly."),
  customerMatching: z
    .object({
      status: z
        .enum(["enabled", "withheldConsent", "unsupportedTransport"])
        .describe(
          "Whether hashed e-mail / phone are sent: enabled, withheld because ad user data consent was not granted, or not supported by the legacy upload method.",
        ),
      fields: z
        .array(z.enum(["email", "phone"]))
        .describe(
          "Which identifiers were configured. The values are never returned.",
        ),
    })
    .nullable()
    .describe(
      "Customer-matching configuration recorded with the event; null when none was configured.",
    ),
  customerProperties: z
    .object({
      status: z
        .enum(["enabled", "withheldConsent", "unsupportedTransport"])
        .describe(
          "Whether the properties are sent: enabled, withheld because ad user data consent was not granted, or not supported by the legacy upload method.",
        ),
      customerType: googleAdsCustomerTypes
        .nullable()
        .describe("Customer type recorded with the event, if any."),
      customerValueBucket: googleAdsCustomerValueBuckets
        .nullable()
        .describe("Customer value bucket recorded with the event, if any."),
    })
    .nullable()
    .describe(
      "Customer properties recorded with the event; null when none was set.",
    ),
  consentSnapshot: z
    .object({
      delivery: z
        .enum(["sent", "toSend", "notSent", "unknown"])
        .describe("Whether the consent reached Google."),
      adUserData: consentStatusSchema.describe("Ad user data consent."),
      adPersonalization: consentStatusSchema.describe(
        "Ad personalization consent.",
      ),
    })
    .nullable()
    .describe("Consent snapshot; null on events recorded before options."),
})
export type GoogleAdsEventResource = z.infer<typeof googleAdsEventResource>

export const listGoogleAdsEventsResponse = z.object({
  data: z.array(googleAdsEventResource),
  total: z.number(),
  page: z.number(),
  perPage: z.number(),
})
