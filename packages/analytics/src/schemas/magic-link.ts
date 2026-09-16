import { z } from "zod"

export const magicLinkStatsSchema = z.object({
  workspaceId: z.string(),
  startDate: z
    .string()
    .describe("ISO 8601 start of the time range (inclusive)."),
  endDate: z.string().describe("ISO 8601 end of the time range (exclusive)."),
  linkId: z.string().describe("Magic link or ref link id."),
  timezone: z
    .string()
    .describe("IANA timezone used to bucket results, e.g. `America/New_York`."),
})

export type MagicLinkStatsInput = z.infer<typeof magicLinkStatsSchema>

export const magicLinkContactStatsSchema = z.object({
  workspaceId: z.string(),
  linkId: z.string().describe("Magic link or ref link id."),
  page: z.number().describe("Page number, starting at 1."),
  perPage: z.number().describe("Number of items per page."),
  startDate: z
    .string()
    .optional()
    .describe("ISO 8601 start of the time range (inclusive)."),
  endDate: z
    .string()
    .optional()
    .describe("ISO 8601 end of the time range (exclusive)."),
  timezone: z
    .string()
    .optional()
    .describe("IANA timezone used to bucket results, e.g. `America/New_York`."),
})

export type MagicLinkContactStatsInput = z.infer<
  typeof magicLinkContactStatsSchema
>

export const refLinkTimeseriesRow = z.object({
  dateReport: z.string(),
  count: z.number(),
})

export type RefLinkTimeseriesRow = z.infer<typeof refLinkTimeseriesRow>
