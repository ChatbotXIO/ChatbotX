import { triggerEventTypes } from "@chatbotx.io/database/partials"
import z from "zod"

export const tagApplied = z.object({
  id: z
    .string()
    .optional()
    .describe(
      "Existing condition id (numeric string) when keeping a condition returned by `triggers.get`; omit for a new condition.",
    ),
  type: z
    .literal(triggerEventTypes.enum.tagApplied)
    .describe('Condition type "tagApplied".'),
  sourceId: z
    .string()
    .describe(
      "Tag id (numeric string, from `tags.list`) whose application fires the trigger.",
    ),
})
export type TagApplied = z.infer<typeof tagApplied>

export const defaultFn = (): TagApplied => ({
  type: triggerEventTypes.enum.tagApplied,
  sourceId: "",
})
export type DefaultFn = typeof defaultFn
