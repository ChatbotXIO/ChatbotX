import { triggerActions } from "@chatbotx.io/database/partials"
import { zodFieldReference } from "@chatbotx.io/flow-config"
import z from "zod"

export const clearCustomField = z.object({
  type: z
    .literal(triggerActions.enum.clearCustomField)
    .describe('Action type "clearCustomField".'),
  customFieldId: zodFieldReference().describe(
    "Id of the custom field (from `customFields.list`) whose value is cleared on the contact.",
  ),
})
export type ClearCustomField = z.infer<typeof clearCustomField>

export const defaultFn = (): ClearCustomField => ({
  type: triggerActions.enum.clearCustomField,
  customFieldId: "",
})
