import { triggerActions } from "@chatbotx.io/database/partials"
import z from "zod"

export const removeTags = z.object({
  type: z
    .literal(triggerActions.enum.removeTag)
    .describe('Action type "removeTag".'),
  tagIds: z
    .array(z.string())
    .min(1)
    .describe("Ids of the tags (from `tags.list`) to remove from the contact."),
})
export type RemoveTags = z.infer<typeof removeTags>

export const defaultFn = (): RemoveTags => ({
  type: triggerActions.enum.removeTag,
  tagIds: [],
})
