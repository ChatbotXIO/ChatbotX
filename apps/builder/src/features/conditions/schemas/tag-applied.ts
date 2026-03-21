import { Condition } from "@chatbotx.io/database/enums"
import z from "zod"

export const tagApplied = z.object({
  id: z.string().optional(),
  type: z.literal(Condition.tagApplied),
  sourceId: z.string(),
})
export type TagApplied = z.infer<typeof tagApplied>

export const defaultFn = (): TagApplied => ({
  type: Condition.tagApplied,
  sourceId: "",
})
export type DefaultFn = typeof defaultFn
