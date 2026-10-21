import { z } from "zod"
import { publicListRequest } from "@/lib/public-api/list"

const dayString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.")

export const statisticsInputSchema = z.object({
  adAccountId: z
    .string()
    .regex(/^act_\d+$/, "Use the act_<id> form.")
    .optional()
    .describe(
      "Ad account (`act_<id>`). Defaults to the account of the workspace's newest campaign.",
    ),
  since: dayString
    .optional()
    .describe(
      "First day (YYYY-MM-DD, ad account timezone). Defaults to 30 days ago, today included.",
    ),
  until: dayString
    .optional()
    .describe("Last day (YYYY-MM-DD, ad account timezone). Defaults to today."),
  search: z
    .string()
    .trim()
    .max(200)
    .optional()
    .describe("Exact Meta id (`campaignId`) or part of the campaign name."),
  ...publicListRequest.shape,
  sort: z
    .enum(["campaignId", "name"])
    .optional()
    .describe("Sort column. Defaults to newest campaign first."),
  order: z
    .enum(["asc", "desc"])
    .default("asc")
    .describe("Sort direction for `sort`."),
})

export type StatisticsInput = z.infer<typeof statisticsInputSchema>

const metric = z.number().nullable()

export const statisticsMetricsSchema = z.object({
  delivered: metric,
  /** Percent, as Meta returns it (e.g. 24.766355). */
  readRate: metric,
  linkClicks: metric,
  linkClickRate: metric,
  /** Major currency units. */
  costPerClick: metric,
  costPerDelivery: metric,
  spend: metric,
})

export type StatisticsMetrics = z.infer<typeof statisticsMetricsSchema>

export const statisticsRowSchema = statisticsMetricsSchema.extend({
  id: z.string(),
  campaignId: z.string(),
  name: z.string(),
  pageId: z.string(),
})

export const statisticsOutputSchema = z.object({
  adAccountId: z.string().nullable(),
  adAccounts: z.array(
    z.object({ id: z.string(), name: z.string().nullable() }),
  ),
  currency: z.string().nullable(),
  timezone: z.string(),
  since: z.string(),
  until: z.string(),
  rows: z.array(statisticsRowSchema),
  aggregate: statisticsMetricsSchema.nullable(),
  aggregateUnavailable: z.boolean(),
  pagination: z.object({
    page: z.number(),
    perPage: z.number(),
    total: z.number(),
    pageCount: z.number(),
  }),
})

export type StatisticsOutput = z.infer<typeof statisticsOutputSchema>
