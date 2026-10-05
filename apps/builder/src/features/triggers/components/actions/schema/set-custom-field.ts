import { triggerActions } from "@chatbotx.io/database/partials"
import { FieldOperationType, zodFieldReference } from "@chatbotx.io/flow-config"
import z from "zod"

export const setCustomField = z.object({
  type: z
    .literal(triggerActions.enum.setCustomField)
    .describe('Action type "setCustomField".'),
  customFieldId: zodFieldReference().describe(
    "Id of the custom field (from `customFields.list`) to update on the contact.",
  ),
  operation: z
    .enum(FieldOperationType)
    .describe(
      "How `value` is applied: O01 set, O02 append, O03 prepend, O04 increase (numeric), O05 decrease (numeric).",
    ),
  value: z
    .string()
    .describe("Value to apply. May include `{{variable}}` placeholders."),
})
export type SetCustomField = z.infer<typeof setCustomField>

export const defaultFn = (): SetCustomField => ({
  type: triggerActions.enum.setCustomField,
  customFieldId: "",
  operation: FieldOperationType.set,
  value: "",
})
