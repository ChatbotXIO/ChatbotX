import { TriggerCondition } from "@aha.chat/database/enums"
import z from "zod"

export const tagApplied = z.object({
  id: z.string().optional(),
  type: z.literal(TriggerCondition.tagApplied),
  sourceId: z.string(),
})
export type TagApplied = z.infer<typeof tagApplied>

export const defaultFn = (): TagApplied => ({
  type: TriggerCondition.tagApplied,
  sourceId: "",
})
export type DefaultFn = typeof defaultFn
