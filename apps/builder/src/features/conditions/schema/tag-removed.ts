import { triggerEventTypes } from "@chatbotx.io/database/partials"
import z from "zod"

export const tagRemoved = z.object({
  id: z.string().optional(),
  type: z.literal(triggerEventTypes.enum.tagRemoved),
  sourceId: z.string(),
})
export type TagRemoved = z.infer<typeof tagRemoved>

export const defaultFn = (): TagRemoved => ({
  type: triggerEventTypes.enum.tagRemoved,
  sourceId: "",
})
