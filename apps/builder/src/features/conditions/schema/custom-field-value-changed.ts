import {
  operatorTypes,
  triggerEventTypes,
} from "@chatbotx.io/database/partials"
import z from "zod"

export const customFieldValueChanged = z.object({
  id: z
    .string()
    .optional()
    .describe(
      "Existing condition id (numeric string) when keeping a condition returned by `triggers.get`; omit for a new condition.",
    ),
  type: z
    .literal(triggerEventTypes.enum.customFieldValueChanged)
    .describe('Condition type "customFieldValueChanged".'),
  sourceId: z
    .string()
    .min(1, "Custom field is required")
    .describe(
      "Id of the custom field (from `customFields.list`) whose value change fires the trigger.",
    ),
  operator: z
    .string()
    .describe(
      "Comparison applied to the field's new value: eq, ne, contains, notContains, startsWith, endsWith, lt, lte, gt, gte, isEmpty, isNotEmpty, isBetween or notBetween.",
    ),
  value: z
    .unknown()
    .describe(
      "Value to compare against. A string or number; for date fields an object `{ text, timezone }`. Ignored for isEmpty/isNotEmpty.",
    ),
})
export type CustomFieldValueChanged = z.infer<typeof customFieldValueChanged>

export const defaultFn = (): CustomFieldValueChanged => ({
  type: triggerEventTypes.enum.customFieldValueChanged,
  sourceId: "",
  operator: operatorTypes.enum.eq,
  value: "",
})
