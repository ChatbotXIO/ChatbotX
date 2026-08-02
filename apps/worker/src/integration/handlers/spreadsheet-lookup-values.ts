import type {
  SpreadsheetClearRowSchema,
  SpreadsheetColumnFilterSchema,
  SpreadsheetGetRandomRowSchema,
  SpreadsheetGetRowSchema,
  SpreadsheetUpdateRowSchema,
} from "@chatbotx.io/flow-config"
import { contactVariableService } from "@chatbotx.io/variables"
import type { ExecuteStepProps } from "./flow"

type SpreadsheetLookupStepSchema =
  | SpreadsheetGetRowSchema
  | SpreadsheetGetRandomRowSchema
  | SpreadsheetUpdateRowSchema
  | SpreadsheetClearRowSchema

/**
 * Lookup condition values support variable templates (e.g. `{{raw:Email}}`),
 * so resolve each value against the contact's variables before matching rows.
 * Legacy literal values contain no tokens and pass through unchanged.
 */
export const resolveSpreadsheetLookup = async (
  props: ExecuteStepProps<SpreadsheetLookupStepSchema>,
): Promise<SpreadsheetColumnFilterSchema> => {
  const { lookup } = props.step
  if (lookup.conditions.length === 0) {
    return lookup
  }

  const variables = await contactVariableService.getAll({
    contactId: props.conversation.contactId,
    contactInbox: props.contactInbox,
    conversation: props.conversation,
  })

  const conditions = await Promise.all(
    lookup.conditions.map(async (condition) => ({
      ...condition,
      value: await contactVariableService.replaceAll({
        text: condition.value ?? "",
        variables,
      }),
    })),
  )

  return { ...lookup, conditions }
}
