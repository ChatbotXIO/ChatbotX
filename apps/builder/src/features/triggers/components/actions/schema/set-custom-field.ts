import { triggerActions } from "@chatbotx.io/database/partials"
import {
  FieldOperationType,
  withFieldOperationOperandRule,
  zodFieldReference,
} from "@chatbotx.io/flow-config"
import z from "zod"
import { getBrowserTimezone } from "@/features/contact-filter/lib/timezone"

export const setCustomField = withFieldOperationOperandRule(
  z.object({
    type: z
      .literal(triggerActions.enum.setCustomField)
      .describe('Action type "setCustomField".'),
    customFieldId: zodFieldReference().describe(
      "Id of the custom field (from `customFields.list`) to update on the contact.",
    ),
    operation: z
      .enum(FieldOperationType)
      .describe(
        "How `value` is applied: O01 set, O02 append, O03 prepend, O04 increase, O05 decrease, O06 clear, O07 formula (math on the current number), O08 set to now, O09 date expression (e.g. `now + 2 days`), O10 add minutes, O11 add hours, O12 add days. Each is valid only for some field types; the operand is optional for O06 and O08.",
      ),
    value: z
      .string()
      .default("")
      .describe(
        "Value to apply. May include `{{variable}}` placeholders. Omit it for the clear (O06) and set-to-now (O08) operations.",
      ),
    timezone: z
      .string()
      .max(64)
      .optional()
      .describe(
        "IANA timezone of the editor, anchoring a date value; defaults to the contact's, then the workspace's zone.",
      ),
  }),
)
export type SetCustomField = z.infer<typeof setCustomField>

/**
 * A new action captures the editor's browser zone, so the worker (no browser
 * context) can anchor a naive date value. Only a new action: an action already
 * stored is never rewritten just by opening the editor.
 */
export const defaultFn = (): SetCustomField => ({
  type: triggerActions.enum.setCustomField,
  customFieldId: "",
  operation: FieldOperationType.set,
  value: "",
  timezone: getBrowserTimezone(),
})
