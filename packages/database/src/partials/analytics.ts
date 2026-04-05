import { z } from "zod"

export const analyticsStatuses = z.enum(["processing", "ingested", "failed"])
export type AnalyticsStatus = z.infer<typeof analyticsStatuses>
