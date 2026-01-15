import { TriggerCondition } from "@aha.chat/database/enums"
import z from "zod"

export const tagRemoved = z.object({
  id: z.string().optional(),
  type: z.literal(TriggerCondition.tagRemoved),
  sourceId: z.string(),
})
export type TagRemoved = z.infer<typeof tagRemoved>

export const defaultFn = (): TagRemoved => ({
  type: TriggerCondition.tagRemoved,
  sourceId: "",
})
