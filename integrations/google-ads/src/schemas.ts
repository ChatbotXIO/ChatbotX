import type {
  Context,
  Handler,
  Oauth2AuthValue,
  Oauth2Config,
} from "@chatbotx.io/sdk"
import { z } from "zod"
import type { GoogleAdsUploadMethod } from "./lib/scopes"

/**
 * The platform `googleAds` credential (its own OAuth app: client id + secret +
 * developer token) plus the redirect URI of this connect.
 */
export type GoogleAdsConfig = Oauth2Config & {
  /** Optional: Google ignores the developer token since the 2026-09 sunset. */
  developerToken?: string
  /** Absent = Data Manager. */
  uploadMethod?: GoogleAdsUploadMethod
}

export type GoogleAdsMetadata = {
  scope?: string
  /** Google account id (`sub`). */
  accountId?: string
  email?: string
  /** Transport this connection's new conversions use; absent = Data Manager. Not secret. */
  uploadMethod?: GoogleAdsUploadMethod
  /** Only ever present inside the encrypted connect session; never persisted. */
  developerToken?: string
  customerId?: string
  loginCustomerId?: string | null
  descriptiveName?: string
  currencyCode?: string
}

export type GoogleAdsAuthValue = Oauth2AuthValue & {
  metadata: GoogleAdsMetadata
}

// ── Google Ads API responses (only the fields we read) ────────────────────────

export const accessibleCustomersSchema = z.object({
  resourceNames: z.array(z.string()).default([]),
})

const customerSchema = z.object({
  id: z.string(),
  descriptiveName: z.string().optional(),
  manager: z.boolean().optional(),
  status: z.string().optional(),
  currencyCode: z.string().optional(),
  conversionTrackingSetting: z
    .object({
      googleAdsConversionCustomer: z.string().optional(),
      acceptedCustomerDataTerms: z.boolean().optional(),
      conversionTrackingStatus: z.string().optional(),
    })
    .optional(),
})

const customerClientSchema = z.object({
  id: z.string(),
  descriptiveName: z.string().optional(),
  manager: z.boolean().optional(),
  status: z.string().optional(),
  currencyCode: z.string().optional(),
})

export const conversionActionSchema = z.object({
  id: z.string(),
  resourceName: z.string(),
  name: z.string(),
  category: z.string().optional(),
  status: z.string().optional(),
  countingType: z.string().optional(),
  clickThroughLookbackWindowDays: z.union([z.string(), z.number()]).optional(),
  // Absent when the enum holds its default (proto3 JSON); a wrongly typed
  // value must not fail the whole listing.
  attributionModelSettings: z
    .object({ attributionModel: z.string().optional().catch(undefined) })
    .optional()
    .catch(undefined),
})

/** One day of one conversion action as Google reports it (by conversion date, the basis ChatbotX counts by). */
export type GoogleAdsConversionReportRow = {
  date: string
  conversionActionId: string
  name: string
  conversions: number
  value: number
}

export const searchStreamResponseSchema = z.array(
  z.object({
    results: z
      .array(
        z.object({
          customer: customerSchema.optional(),
          customerClient: customerClientSchema.optional(),
          conversionAction: conversionActionSchema.optional(),
          segments: z
            .object({
              date: z.string().optional(),
              conversionAction: z.string().optional(),
              conversionActionName: z.string().optional(),
            })
            .optional(),
          // Doubles arrive as JSON numbers; absent when zero is not guaranteed, so default at the reader.
          metrics: z
            .object({
              conversionsByConversionDate: z.number().optional(),
              conversionsValueByConversionDate: z.number().optional(),
            })
            .optional(),
        }),
      )
      .default([]),
  }),
)

export const ingestResponseSchema = z.object({
  requestId: z.string().optional(),
  fieldWarnings: z.array(z.unknown()).optional(),
})

// Proto3 JSON omits enum fields holding their default value, so every enum is
// optional-with-default rather than required.
const reasonCountSchema = z.object({
  reason: z.string().default("PROCESSING_ERROR_REASON_UNSPECIFIED"),
  recordCount: z.union([z.string(), z.number()]).optional(),
})

const ingestionStatusSchema = z.object({
  recordCount: z.union([z.string(), z.number()]).optional(),
})

export const requestStatusResponseSchema = z.object({
  requestStatusPerDestination: z
    .array(
      z.object({
        // The shape of `destination` is deliberately not relied on: a
        // one-destination request has exactly one entry.
        destination: z.unknown().optional(),
        requestStatus: z.string().default("REQUEST_STATUS_UNKNOWN"),
        errorInfo: z
          .object({ errorCounts: z.array(reasonCountSchema).default([]) })
          .optional(),
        warningInfo: z
          .object({ warningCounts: z.array(reasonCountSchema).default([]) })
          .optional(),
        // Documented name (Data Manager REST `RequestStatusPerDestination`).
        eventsIngestionStatus: ingestionStatusSchema.optional(),
        // Earlier spelling this adapter shipped with; still tolerated.
        ingestEventsStatus: ingestionStatusSchema.optional(),
      }),
    )
    .default([]),
})

// ── Results returned by our API wrappers ──────────────────────────────────────

export type GoogleAdsCustomer = {
  id: string
  descriptiveName: string | null
  manager: boolean
  status: string | null
  currencyCode: string | null
  /** Customer that owns conversion actions; `null` when tracking is not set up. */
  conversionCustomerId: string | null
  acceptedCustomerDataTerms: boolean | null
  conversionTrackingStatus: string | null
}

export type GoogleAdsClientCustomer = {
  id: string
  descriptiveName: string | null
  currencyCode: string | null
}

export type GoogleAdsConversionAction = {
  id: string
  resourceName: string
  name: string
  category: string
  status: string
  countingType: string
  clickThroughLookbackWindowDays: number | null
  /**
   * `AttributionModel` enum name; `EXTERNAL` means conversions come from a
   * third-party attribution source, which Data Manager cannot ingest.
   */
  attributionModel: string | null
}

export type GoogleAdsClickIdType = "gclid" | "gbraid"

/** One consent answer; an absent key is omitted from the upload. */
export type GoogleAdsIngestConsentStatus = "granted" | "denied"

export type GoogleAdsIngestConsent = {
  adUserData?: GoogleAdsIngestConsentStatus
  adPersonalization?: GoogleAdsIngestConsentStatus
}

/**
 * Customer-matching identifiers for Data Manager `userData`: lowercase-or-
 * uppercase hex SHA-256 digests (64 chars), already normalised and hashed by
 * the caller. Validated again at the wire, never trusted by type alone.
 */
export type GoogleAdsIngestUserIdentifiers = {
  emailAddress?: string
  phoneNumber?: string
}

/** Data Manager `userProperties`: advertiser-assessed customer facts, validated again at the wire. */
export type GoogleAdsIngestUserProperties = {
  customerType?: string
  customerValueBucket?: string
}

export type GoogleAdsIngestEvent = {
  transactionId: string
  eventTimestamp: Date
  clickIdType: GoogleAdsClickIdType
  clickId: string
  value?: number
  currency?: string
  /** From the event's immutable options snapshot, already filtered for the transport. */
  consent?: GoogleAdsIngestConsent
  /** Data Manager only; the legacy transport ignores it. */
  userIdentifiers?: GoogleAdsIngestUserIdentifiers
  /** Data Manager only; the legacy transport ignores it. */
  userProperties?: GoogleAdsIngestUserProperties
}

/** What a legacy upload came back with that is not an error to throw. */
export type GoogleAdsLegacyUploadOutcome =
  /** Google recorded the conversion synchronously; `requestId` is `legacy:<jobId>`. */
  | { kind: "completed"; requestId: string; fieldWarnings: unknown[] }
  /** `validateOnly` was accepted; nothing was recorded. */
  | { kind: "validated"; fieldWarnings: unknown[] }
  /** Google-side transient failure: send the same conversion again later. */
  | { kind: "retry"; reason: "tooRecent" | "transient" }
  /** Google already holds this click/order id: on a replay this means "recorded". */
  | { kind: "duplicate" }

/** Result of the `ingestEvent` action, whichever transport the event is pinned to. */
export type GoogleAdsIngestOutcome =
  /** Data Manager accepted the request; its outcome is polled via `requestId`. */
  | {
      kind: "accepted"
      requestId: string | null
      fieldWarnings: unknown[]
    }
  | GoogleAdsLegacyUploadOutcome

export type GoogleAdsRequestStatus = {
  requestStatus: string
  recordCount: number | null
  errorCounts: { reason: string; recordCount: number }[]
  warningCounts: { reason: string; recordCount: number }[]
}

/** Sent as the `developer-token` header only when present. */
type DeveloperToken = { developerToken?: string }

export type GoogleAdsActions = {
  resolveConversionCustomer: Handler<
    { ctx: Context<GoogleAdsAuthValue>; props: DeveloperToken },
    GoogleAdsCustomer
  >
  getConversionReport: Handler<
    {
      ctx: Context<GoogleAdsAuthValue>
      props: DeveloperToken & {
        conversionCustomerId: string
        /** First and last day (YYYY-MM-DD, the account's timezone), inclusive. */
        from: string
        to: string
      }
    },
    GoogleAdsConversionReportRow[]
  >
  listConversionActions: Handler<
    {
      ctx: Context<GoogleAdsAuthValue>
      props: DeveloperToken & { conversionCustomerId: string }
    },
    GoogleAdsConversionAction[]
  >
  ingestEvent: Handler<
    {
      ctx: Context<GoogleAdsAuthValue>
      props: {
        loginAccountId: string
        operatingAccountId: string
        conversionActionId: string
        event: GoogleAdsIngestEvent
        validateOnly?: boolean
        /** Transport the event is pinned to; absent = Data Manager. */
        uploadMethod?: GoogleAdsUploadMethod
        /** Only the legacy transport sends it, and only when present. */
        developerToken?: string
      }
    },
    GoogleAdsIngestOutcome
  >
  retrieveRequestStatus: Handler<
    { ctx: Context<GoogleAdsAuthValue>; props: { requestId: string } },
    GoogleAdsRequestStatus[]
  >
}
