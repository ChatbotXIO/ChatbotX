import { triggerActions } from "@chatbotx.io/database/partials"
import z from "zod"

export const removeTags = z.object({
  type: z.literal(triggerActions.enum.removeTag),
  tagIds: z.array(z.string()).min(1),
})
export type RemoveTags = z.infer<typeof removeTags>

export const defaultFn = (): RemoveTags => ({
  type: triggerActions.enum.removeTag,
  tagIds: [],
})
