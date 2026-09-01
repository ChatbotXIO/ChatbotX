import { triggerActions } from "@chatbotx.io/database/partials"
import z from "zod"

export const addTags = z.object({
  type: z.literal(triggerActions.enum.addTag),
  tagIds: z.array(z.string()).min(1),
})
export type AddTags = z.infer<typeof addTags>

export const defaultFn = (): AddTags => ({
  type: triggerActions.enum.addTag,
  tagIds: [],
})
