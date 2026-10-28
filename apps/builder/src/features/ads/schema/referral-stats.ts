import { adsEligibleChannelTypes } from "@chatbotx.io/utils/channel"
import { z } from "zod"

const dateKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("Day as `YYYY-MM-DD`, in the `tz` timezone.")

export const referralStatsRequest = z.object({
  from: dateKey
    .optional()
    .describe("First day (inclusive). Defaults to 7 days ago."),
  to: dateKey.optional().describe("Last day (inclusive). Defaults to today."),
  tz: z
    .string()
    .max(64)
    .optional()
    .describe("IANA timezone the days are read in. Defaults to UTC."),
  channel: adsEligibleChannelTypes
    .optional()
    .describe("Restrict to ads that brought contacts on this channel."),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(50)
    .describe("Maximum number of ads to return, the most-reaching first."),
})
export type ReferralStatsRequest = z.infer<typeof referralStatsRequest>

export const referralStatsResource = z.object({
  adId: z.string().describe("Ad id. Matches `clickedAd` filter values."),
  title: z.string().nullable().describe("The ad's latest headline."),
  anyTouchContacts: z
    .number()
    .int()
    .describe("Contacts that came from this ad at least once in the range."),
  firstTouchContacts: z
    .number()
    .int()
    .describe("Contacts whose first ad in the range was this one."),
  leads: z
    .number()
    .int()
    .describe("Lead conversions credited to this ad's clicks."),
  purchases: z
    .number()
    .int()
    .describe("Purchase conversions credited to this ad's clicks."),
  revenue: z
    .array(
      z.object({
        currency: z.string().nullable(),
        amount: z.string().describe("Decimal amount in major units."),
      }),
    )
    .describe("Purchase value credited to this ad, per currency."),
})

export const referralStatsResponse = z.object({
  data: z.array(referralStatsResource),
})
export type ReferralStatsResponse = z.infer<typeof referralStatsResponse>
