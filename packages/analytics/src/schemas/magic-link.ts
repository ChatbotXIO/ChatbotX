import { z } from "zod"

export const magicLinkStatsSchema = z.object({
  workspaceId: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  linkId: z.string(),
  timezone: z.string(),
})

export type MagicLinkStatsInput = z.infer<typeof magicLinkStatsSchema>

export const magicLinkContactStatsSchema = z.object({
  workspaceId: z.string(),
  linkId: z.string(),
  page: z.number(),
  perPage: z.number(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  timezone: z.string().optional(),
})

export type MagicLinkContactStatsInput = z.infer<
  typeof magicLinkContactStatsSchema
>

export const refLinkTimeseriesRow = z.object({
  dateReport: z.string(),
  count: z.number(),
})

export type RefLinkTimeseriesRow = z.infer<typeof refLinkTimeseriesRow>
