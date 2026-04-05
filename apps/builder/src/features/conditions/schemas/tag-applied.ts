import { triggerEventTypes } from "@chatbotx.io/database/partials"
import z from "zod"

export const tagApplied = z.object({
  id: z.string().optional(),
  type: z.literal(triggerEventTypes.enum.tagApplied),
  sourceId: z.string(),
})
export type TagApplied = z.infer<typeof tagApplied>

export const defaultFn = (): TagApplied => ({
  type: triggerEventTypes.enum.tagApplied,
  sourceId: "",
})
export type DefaultFn = typeof defaultFn
