import {
  GOOGLE_ADS_CHANNEL_VALUES,
  type GoogleAdsEventStatus,
} from "@chatbotx.io/database/partials"
import { z } from "zod"

// Pure zod (no DB client): the service returns this shape and the builder's
// private view and public API parse it, so the three can never drift. It lives
// in business, not in the builder, because the service cannot import the builder.

const CONVERSION_ACTION_ID_PATTERN = /^\d+$/

/**
 * `from`, `to` and `tz` are plain strings (empty or invalid allowed):
 * `parseAnalyticsDateRange` normalises them, so a first visit with no query
 * string works. `channel` and `conversionActionId` are validated here.
 */
export const getGoogleAdsStatsInput = z.object({
  workspaceId: z.string(),
  from: z.string().default(""),
  to: z.string().default(""),
  tz: z.string().default(""),
  channel: z.enum(GOOGLE_ADS_CHANNEL_VALUES).optional(),
  conversionActionId: z
    .string()
    .regex(CONVERSION_ACTION_ID_PATTERN, "Conversion action id must be numeric")
    .optional(),
})
export type GetGoogleAdsStatsInput = z.input<typeof getGoogleAdsStatsInput>

const count = (description: string) => z.number().int().describe(description)

const STATUS_DESCRIPTIONS: Record<GoogleAdsEventStatus, string> = {
  pending: "Conversions queued, waiting to be sent to Google.",
  sending: "Conversions being sent to Google right now.",
  sent: "Conversions sent to Google, waiting for Google to finish processing.",
  processed: "Conversions Google confirmed it recorded.",
  failed: "Conversions Google did not accept or could not process.",
  skipped_no_account:
    "Conversions not sent because no ready Google Ads account was connected.",
  skipped_expired: "Conversions not sent because they were too old for Google.",
}

// `satisfies` makes a new event status a compile error here instead of a field
// silently stripped by response parsing.
const statusCountsShape = {
  pending: count(STATUS_DESCRIPTIONS.pending),
  sending: count(STATUS_DESCRIPTIONS.sending),
  sent: count(STATUS_DESCRIPTIONS.sent),
  processed: count(STATUS_DESCRIPTIONS.processed),
  failed: count(STATUS_DESCRIPTIONS.failed),
  skipped_no_account: count(STATUS_DESCRIPTIONS.skipped_no_account),
  skipped_expired: count(STATUS_DESCRIPTIONS.skipped_expired),
} satisfies Record<GoogleAdsEventStatus, z.ZodNumber>

export const googleAdsStatusCountsSchema = z.object(statusCountsShape)

export const googleAdsStatsResponse = z.object({
  range: z
    .object({
      from: z.string().describe("First day counted (YYYY-MM-DD), as resolved."),
      to: z.string().describe("Last day counted (YYYY-MM-DD), as resolved."),
      tz: z.string().describe("IANA timezone the days were bucketed in."),
    })
    .describe(
      "The range actually used after normalising invalid, inverted or oversized input.",
    ),
  totals: googleAdsStatusCountsSchema
    .extend({
      total: count("All conversions in the range."),
      deliveryRate: z
        .number()
        .min(0)
        .max(1)
        .nullable()
        .describe(
          "processed / (processed + failed); null when there are neither. Queued, awaiting and skipped events are excluded.",
        ),
    })
    .describe("Conversion counts per status over the whole range."),
  failuresByStage: z
    .object({
      delivery: count("Failed while sending to Google."),
      processing: count("Failed while Google processed them."),
      timeout: count("Google did not finish processing in time."),
      unknown: count("Failed with no recorded stage."),
    })
    .describe("Failed conversions by the stage they failed at."),
  confirmedValue: z
    .array(
      z.object({
        currency: z.string().describe("ISO 4217 currency code."),
        value: z
          .string()
          .describe("Exact decimal total of confirmed conversion values."),
        count: count("Confirmed conversions that carried a value."),
      }),
    )
    .describe(
      "Confirmed value per currency; never summed across currencies. Conversions without a value add nothing.",
    ),
  timeseries: z
    .array(
      z.object({
        date: z.string().describe("Day (YYYY-MM-DD) in the range timezone."),
        counts: googleAdsStatusCountsSchema,
      }),
    )
    .describe(
      "One row per day in the range, zero-filled. Days are the conversion time, not the recorded time.",
    ),
  byAction: z
    .array(
      z.object({
        conversionActionId: z.string().describe("Google conversion action ID."),
        name: z
          .string()
          .nullable()
          .describe("Latest known name of the conversion action."),
        category: z
          .string()
          .nullable()
          .describe("Latest known category of the conversion action."),
        total: count("All conversions for this action in the range."),
        counts: googleAdsStatusCountsSchema,
      }),
    )
    .describe(
      "Counts per conversion action, busiest first (at most 50). Read separately from the other fields, so it can differ slightly under concurrent changes.",
    ),
  byActionTruncated: z
    .boolean()
    .describe("True when more than 50 conversion actions had conversions."),
  byChannel: z
    .array(
      z.object({
        channel: z.string().describe("Channel the conversion came from."),
        total: count("All conversions from this channel in the range."),
        counts: googleAdsStatusCountsSchema,
      }),
    )
    .describe("Counts per channel."),
})
export type GoogleAdsStatsResponse = z.infer<typeof googleAdsStatsResponse>
