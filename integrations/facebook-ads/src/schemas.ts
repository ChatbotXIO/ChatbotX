import {
  AuthType,
  type Context,
  customAuthSchema,
  type Handler,
} from "@chatbotx.io/sdk"
import { z } from "zod"

export type FacebookAdsConfig = {
  clientId: string
  clientSecret: string
  version?: string
}

export const facebookAdsAuthSchema = customAuthSchema.extend({
  authType: z.literal(AuthType.custom),
  accessToken: z.string().trim().min(1),
  /** ISO timestamp derived from Facebook's `expires_in` at connect time. */
  expiresAt: z.string().trim().optional(),
  version: z.string().trim().optional(),
})
export type FacebookAdsAuthValue = z.infer<typeof facebookAdsAuthSchema>

export const facebookAdAccountSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
})
export type FacebookAdAccount = z.infer<typeof facebookAdAccountSchema>

export const facebookCustomAudienceSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  subtype: z.string().optional(),
})
export type FacebookCustomAudience = z.infer<
  typeof facebookCustomAudienceSchema
>

const numericInsightField = z
  .union([z.string(), z.number()])
  .optional()
  .transform((value) => {
    if (value === undefined || value === "") {
      return 0
    }
    const parsed = typeof value === "number" ? value : Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  })

export const facebookAdInsightSchema = z.object({
  ad_id: z.string(),
  ad_name: z.string().optional(),
  spend: numericInsightField,
  impressions: numericInsightField,
  clicks: numericInsightField,
  date_start: z.string().optional(),
})
export type FacebookAdInsight = z.infer<typeof facebookAdInsightSchema>

export const customAudienceOperations = z.enum(["add", "remove"])
export type CustomAudienceOperation = z.infer<typeof customAudienceOperations>

/** Contact identity used to match the subscriber on Facebook's side. */
export type AudienceContact = {
  email?: string | null
  phoneNumber?: string | null
  firstName?: string | null
  lastName?: string | null
  country?: string | null
}

export type SyncAudienceUserProps = {
  customAudienceId: string
  operation: CustomAudienceOperation
  /** Messenger page-scoped user id — required for normal (PAGEUID) audiences. */
  psid?: string | null
  /** Facebook page id the PSID belongs to. */
  pageId?: string | null
  contact: AudienceContact
  /**
   * Workspace-level ISO-2 country used as the phone-parsing region when the
   * contact has no usable country of its own (workspace `targetCountry`).
   */
  fallbackCountry?: string | null
}

export type GetAdInsightsProps = {
  adAccountId: string
  since: string
  until: string
  /** When set to 1, requests daily-broken-down rows (adds `date_start`). */
  timeIncrement?: 1
}

export type CreateCustomAudienceProps = {
  adAccountId: string
  name: string
  description?: string | null
}

export type BulkSyncHashedAudienceUsersProps = {
  customAudienceId: string
  operation: CustomAudienceOperation
  contacts: AudienceContact[]
  fallbackCountry?: string | null
}

export type FacebookAdsActions = {
  getAdAccounts: Handler<
    { ctx: Context<FacebookAdsAuthValue> },
    FacebookAdAccount[]
  >
  getCustomAudiences: Handler<
    { ctx: Context<FacebookAdsAuthValue>; props: { adAccountId: string } },
    FacebookCustomAudience[]
  >
  getAdInsights: Handler<
    { ctx: Context<FacebookAdsAuthValue>; props: GetAdInsightsProps },
    FacebookAdInsight[]
  >
  createCustomAudience: Handler<
    { ctx: Context<FacebookAdsAuthValue>; props: CreateCustomAudienceProps },
    { id: string }
  >
  bulkSyncHashedAudienceUsers: Handler<
    {
      ctx: Context<FacebookAdsAuthValue>
      props: BulkSyncHashedAudienceUsersProps
    },
    { received: number; batches: number }
  >
  syncAudienceUser: Handler<
    { ctx: Context<FacebookAdsAuthValue>; props: SyncAudienceUserProps },
    void
  >
}
