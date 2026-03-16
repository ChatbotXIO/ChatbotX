import { TriggerAction } from "@aha.chat/database/enums"
import z from "zod"

export const removeTags = z.object({
  type: z.literal(TriggerAction.removeTag),
  tagIds: z.array(z.string()).min(1),
})
export type RemoveTags = z.infer<typeof removeTags>

export const defaultFn = (): RemoveTags => ({
  type: TriggerAction.removeTag,
  tagIds: [],
})
