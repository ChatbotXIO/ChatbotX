import { z } from "zod"

export const presetOption = z.enum([
  "today",
  "yesterday",
  "last7",
  "last30",
  "thisMonth",
  "lastMonth",
  "lifeTime",
  "custom",
])
export type PresetOption = z.infer<typeof presetOption>

export const analysisFilterSchema = z.object({
  preset: presetOption,
  from: z.date(),
  to: z.date(),
})
export type AnalysisFilterSchema = z.infer<typeof analysisFilterSchema>
