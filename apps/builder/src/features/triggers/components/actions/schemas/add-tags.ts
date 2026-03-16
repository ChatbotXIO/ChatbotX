import { TriggerAction } from "@aha.chat/database/enums"
import z from "zod"

export const addTags = z.object({
  type: z.literal(TriggerAction.addTag),
  tagIds: z.array(z.string()).min(1),
})
export type AddTags = z.infer<typeof addTags>

export const defaultFn = (): AddTags => ({
  type: TriggerAction.addTag,
  tagIds: [],
})
