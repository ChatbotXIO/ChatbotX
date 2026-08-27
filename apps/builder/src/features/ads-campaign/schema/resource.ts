import { z } from "zod"

export const messagingAdOperationResource = z.object({
  id: z.string(),
  workspaceId: z.string(),
  channel: z.string(),
  adAccountId: z.string(),
  name: z.string(),
  createState: z.string(),
  publishState: z.string(),
  metaCampaignId: z.string().nullable(),
  metaAdSetId: z.string().nullable(),
  metaAdCreativeId: z.string().nullable(),
  metaAdId: z.string().nullable(),
  lastError: z.string().nullable(),
  cleanupError: z.string().nullable(),
  /** Meta's live `effective_status` — never the DB's configured status. Null while the campaign has not been created yet, or on a fetch failure. */
  effectiveStatus: z.string().nullable(),
  createdAt: z.date(),
})
export type MessagingAdOperationResource = z.infer<
  typeof messagingAdOperationResource
>

export const adAccountDetailsResource = z.object({
  id: z.string(),
  name: z.string().optional(),
  currency: z.string(),
  timezoneName: z.string(),
  accountStatus: z.number(),
  minDailyBudgetMinorUnits: z.number().optional(),
})

/** One ad's Ads Insights (performance) row — the box's separate "Ads Insights" read, never merged into `messagingAdOperationResource`. */
export const messagingAdInsightResource = z.object({
  adId: z.string(),
  /** Ad account's currency (Meta `account_currency`); `null` when Meta omits it. */
  currency: z.string().nullable(),
  impressions: z.number(),
  reach: z.number(),
  spend: z.number(),
  clicks: z.number(),
  conversations: z.number(),
  costPerConversation: z.number().nullable(),
})
export type MessagingAdInsightResource = z.infer<
  typeof messagingAdInsightResource
>
