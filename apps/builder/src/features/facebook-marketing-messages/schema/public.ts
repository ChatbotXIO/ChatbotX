import {
  facebookMarketingMessageStatuses,
  facebookMarketingMessageStatusReasons,
} from "@chatbotx.io/database/partials"
import { z } from "zod"
import { AUDIENCE_DESCRIPTION_MAX, AUDIENCE_NAME_MAX } from "./audience"
import { mmContentSchema } from "./content"
import {
  MM_NAME_MAX,
  marketingMessageFieldsSchema,
  targetTypeSchema,
  updateMarketingMessageSchema,
} from "./resource"

/** Same cap as the file upload (`AUDIENCE_MAX_ROWS` in the audience service). */
export const AUDIENCE_PUBLIC_MAX_ROWS = 100_000

export const adAccountOptionSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  name: z.string(),
  currency: z.string(),
  tosAccepted: z.boolean(),
  tosUrl: z.string(),
})

export const audienceRowSchema = z.object({
  id: z.string(),
  customAudienceId: z.string(),
  adAccountId: z.string(),
  pageId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  rowsUploaded: z.number(),
  readyAt: z.date().nullable(),
  createdAt: z.date(),
})

export const audienceLiveStatusSchema = z.object({
  lower: z.number().nullable(),
  upper: z.number().nullable(),
  deliveryStatus: z
    .object({ code: z.number(), description: z.string() })
    .nullable(),
  ready: z.boolean(),
  missingOnMeta: z.boolean(),
  pageDisconnected: z.boolean(),
})

export const adAccountsOutputSchema = z.object({
  accounts: z.array(adAccountOptionSchema),
})

export const pagesOutputSchema = z.object({
  pages: z.array(z.object({ pageId: z.string(), name: z.string() })),
})

export const audiencesListInputSchema = z.object({
  adAccountId: z
    .string()
    .optional()
    .describe(
      "Only audiences on this ad account. Get it from `facebookMarketingMessages.adAccounts.list`.",
    ),
  pageId: z
    .string()
    .optional()
    .describe(
      "Only audiences for this Page. Get it from `facebookMarketingMessages.pages.list`.",
    ),
  readyOnly: z
    .boolean()
    .optional()
    .describe("Only audiences a campaign can target (`readyAt` set)."),
})

export const audiencesListOutputSchema = z.object({
  audiences: z.array(audienceRowSchema),
})

export const audiencesLiveOutputSchema = z.object({
  statuses: z.record(z.string(), audienceLiveStatusSchema),
})

export const campaignResourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  pageId: z.string(),
  adAccountId: z.string(),
  currency: z.string(),
  budgetType: z.enum(["daily", "lifetime"]),
  budgetMinorUnits: z.number(),
  content: mmContentSchema,
  targetType: z.enum(["optIn", "customAudience"]),
  audienceId: z.string().nullable(),
  campaignId: z
    .string()
    .describe("The Meta message campaign id (not a workspace id)."),
  status: z.enum(facebookMarketingMessageStatuses),
  statusReason: z.enum(facebookMarketingMessageStatusReasons).nullable(),
  statusErrorCode: z.number().nullable(),
  statusErrorMessage: z.string().nullable(),
  startsAt: z.date().nullable(),
  startedAt: z.date().nullable(),
  firstSentAt: z.date().nullable(),
  completedAt: z.date().nullable(),
  nextDayAt: z.date().nullable(),
  tokenCount: z.number().nullable(),
  createdAt: z.date(),
})

export const campaignStatsSchema = z.object({
  counts: z.object({
    pending: z.number(),
    sent: z.number(),
    delivered: z.number(),
    failed: z.number(),
    unconfirmed: z.number(),
  }),
  errors: z.array(
    z.object({
      errorCode: z.number().nullable(),
      errorMessage: z.string(),
      count: z.number(),
    }),
  ),
})

export const campaignDetailSchema = campaignResourceSchema.extend({
  stats: campaignStatsSchema,
})

export const audienceIdParamSchema = z.object({
  id: z
    .string()
    .describe(
      "Audience id. Get it from `facebookMarketingMessages.audiences.list`.",
    ),
})

const audienceTableSchema = z.object({
  headers: z
    .array(z.string())
    .min(1)
    .describe(
      "Header row. Must include an email or phone column; other columns are ignored.",
    ),
  rows: z
    .array(z.array(z.string()))
    .max(AUDIENCE_PUBLIC_MAX_ROWS)
    .describe(
      `Data rows, each aligned to \`headers\`. Up to ${AUDIENCE_PUBLIC_MAX_ROWS} rows.`,
    ),
})

export const createAudiencePublicRequest = audienceTableSchema.extend({
  adAccountId: z
    .string()
    .trim()
    .min(1)
    .describe(
      "Ad account id (`act_...`). Get it from `facebookMarketingMessages.adAccounts.list`.",
    ),
  pageId: z
    .string()
    .trim()
    .min(1)
    .describe(
      "Messenger Page id. Get it from `facebookMarketingMessages.pages.list`.",
    ),
  name: z
    .string()
    .trim()
    .min(1)
    .max(AUDIENCE_NAME_MAX)
    .describe("Audience name."),
  description: z
    .string()
    .trim()
    .max(AUDIENCE_DESCRIPTION_MAX)
    .optional()
    .describe("Optional audience description."),
})

export const uploadMoreAudiencePublicRequest = audienceTableSchema.extend({
  id: audienceIdParamSchema.shape.id,
})

export const uploadOutcomeSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    id: z.string(),
    customAudienceId: z.string(),
    received: z.number(),
    skipped: z.number(),
    invalid: z.number(),
  }),
  z.object({
    status: z.literal("partial"),
    received: z.number(),
    message: z.string(),
  }),
  z.object({ status: z.literal("invalid"), message: z.string() }),
])

const campaignFieldDescriptions = {
  name: z.string().trim().min(1).max(MM_NAME_MAX).describe("Campaign name."),
  budgetMajorUnits: z.coerce
    .number()
    .positive()
    .describe(
      "Budget amount in major units of the ad account currency, for example 30 for 30.00 USD.",
    ),
  content: mmContentSchema.describe(
    "Message content: a text, media or generic template with optional buttons and quick replies.",
  ),
}

export const createCampaignPublicRequest = marketingMessageFieldsSchema
  .extend({
    ...campaignFieldDescriptions,
    budgetType: z
      .enum(["daily", "lifetime"])
      .describe(
        "`daily` sends up to the daily delivery estimate each day; `lifetime` is a single pass.",
      ),
    pageId: z
      .string()
      .trim()
      .min(1)
      .describe(
        "Messenger Page id. Get it from `facebookMarketingMessages.pages.list`.",
      ),
    adAccountId: z
      .string()
      .trim()
      .min(1)
      .describe(
        "Ad account id (`act_...`). Get it from `facebookMarketingMessages.adAccounts.list`.",
      ),
    targetType: targetTypeSchema.describe(
      "`optIn` targets everyone opted in to Updates and promotions; `customAudience` targets one ready audience.",
    ),
    audienceId: z
      .string()
      .nullable()
      .optional()
      .describe(
        "Required for `customAudience`: a ready audience on the same ad account and Page, from `facebookMarketingMessages.audiences.list` (`readyOnly`).",
      ),
  })
  .refine(
    (value) =>
      value.targetType !== "customAudience" || Boolean(value.audienceId),
    { path: ["audienceId"] },
  )

export const updateCampaignPublicRequest = updateMarketingMessageSchema.extend({
  ...campaignFieldDescriptions,
  id: z
    .string()
    .describe(
      "Campaign id. Get it from `facebookMarketingMessages.campaigns.list`.",
    ),
})

export const campaignIdParamSchema = z.object({
  id: z
    .string()
    .describe(
      "Campaign id. Get it from `facebookMarketingMessages.campaigns.list`.",
    ),
})
