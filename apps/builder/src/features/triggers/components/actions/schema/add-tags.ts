import { triggerActions } from "@chatbotx.io/database/partials"
import z from "zod"

export const addTags = z.object({
  type: z.literal(triggerActions.enum.addTag).describe('Action type "addTag".'),
  tagIds: z
    .array(z.string())
    .min(1)
    .describe("Ids of the tags (from `tags.list`) to add to the contact."),
})
export type AddTags = z.infer<typeof addTags>

export const defaultFn = (): AddTags => ({
  type: triggerActions.enum.addTag,
  tagIds: [],
})
