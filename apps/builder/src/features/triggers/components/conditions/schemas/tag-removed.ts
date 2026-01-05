import { TriggerCondition } from "@aha.chat/database/enums"
import z from "zod"

export const tagRemoved = z.object({
  type: z.literal(TriggerCondition.tagRemoved),
  tagId: z.string(),
})
export type TagRemoved = z.infer<typeof tagRemoved>

export const defaultFn = (): TagRemoved => ({
  type: TriggerCondition.tagRemoved,
  tagId: "",
})
