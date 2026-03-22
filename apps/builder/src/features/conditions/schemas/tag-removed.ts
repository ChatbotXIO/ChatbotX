import { Condition } from "@aha.chat/database/enums"
import z from "zod"

export const tagRemoved = z.object({
  id: z.string().optional(),
  type: z.literal(Condition.tagRemoved),
  sourceId: z.string(),
})
export type TagRemoved = z.infer<typeof tagRemoved>

export const defaultFn = (): TagRemoved => ({
  type: Condition.tagRemoved,
  sourceId: "",
})
