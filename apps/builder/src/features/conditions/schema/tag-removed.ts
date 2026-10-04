import { triggerEventTypes } from "@chatbotx.io/database/partials"
import z from "zod"

export const tagRemoved = z.object({
  id: z
    .string()
    .optional()
    .describe(
      "Existing condition id (numeric string) when keeping a condition returned by `triggers.get`; omit for a new condition.",
    ),
  type: z
    .literal(triggerEventTypes.enum.tagRemoved)
    .describe('Condition type "tagRemoved".'),
  sourceId: z
    .string()
    .describe(
      "Tag id (numeric string, from `tags.list`) whose removal fires the trigger.",
    ),
})
export type TagRemoved = z.infer<typeof tagRemoved>

export const defaultFn = (): TagRemoved => ({
  type: triggerEventTypes.enum.tagRemoved,
  sourceId: "",
})
