import { TriggerCondition } from "@aha.chat/database/enums"
import z from "zod"

export const tagApplied = z.object({
  type: z.literal(TriggerCondition.tagApplied),
  tagId: z.string(),
})
export type TagApplied = z.infer<typeof tagApplied>

export const defaultFn = (): TagApplied => ({
  type: TriggerCondition.tagApplied,
  tagId: "",
})
export type DefaultFn = typeof defaultFn
