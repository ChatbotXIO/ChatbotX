import { contactReferralEventProviderSchema } from "@chatbotx.io/database/schema"
import { z } from "zod"

export const contactAdReferralResource = z.object({
  id: z.string().describe("Id of this touch."),
  adId: z
    .string()
    .nullable()
    .describe(
      "Ad id. Null for a Google click read from a channel that carries no ad id (Zalo).",
    ),
  title: z
    .string()
    .nullable()
    .describe("The ad's headline, when the channel carried one."),
  channel: z.string().describe("Channel the contact arrived on."),
  provider: contactReferralEventProviderSchema
    .nullable()
    .describe("Ad network: `meta` or `google`."),
  campaignId: z.string().nullable(),
  adGroupId: z.string().nullable(),
  source: z.string().nullable(),
  sourceUrl: z
    .string()
    .nullable()
    .describe("The ad or post the contact clicked."),
  occurredAt: z.date().describe("When the message carrying the click arrived."),
})
export type ContactAdReferralResource = z.infer<
  typeof contactAdReferralResource
>

export const listContactAdReferralsRequest = z.object({
  perPage: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Number of ad touches per page."),
  cursor: z
    .string()
    .optional()
    .describe(
      "Opaque pagination cursor from a previous response. Omit for the first page.",
    ),
})

export const listContactAdReferralsResponse = z.object({
  data: z.array(contactAdReferralResource),
  nextCursor: z
    .string()
    .nullable()
    .describe("Pass as `cursor` for the next page; null on the last page."),
})
export type ListContactAdReferralsResponse = z.infer<
  typeof listContactAdReferralsResponse
>
