import { contactCustomFieldService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type {
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import type { FieldOperationType } from "@chatbotx.io/flow-config"
import { contactVariableService } from "@chatbotx.io/variables"

const VARIABLE_TOKEN = "{{"

export type CustomFieldOperationTarget = {
  /** `bot_field:<id>`, a custom field id, or a legacy field name. */
  fieldReference: string
  operation: FieldOperationType
  /** May contain `{{variable}}` tokens. */
  value: string
  /** Editor zone that anchors naive date/datetime values. */
  timezone?: string
}

export type CustomFieldOperationContext = {
  workspaceId: string
  contactId: string
  conversation: ConversationModel
  /** The full model when the caller has it; an id avoids a second lookup. */
  contactInbox: ContactInboxModel | string | null
  sentByUserId?: string
  valueOptions: Pick<
    Parameters<typeof contactCustomFieldService.setValueByKey>[0],
    "temporalInputParsing" | "fillEmptyTemporalWithNow"
  >
}

export type CustomFieldOperationOutcome =
  | { status: "applied" }
  | { status: "rejected"; reason: string }

const contactInboxIdOf = (
  contactInbox: CustomFieldOperationContext["contactInbox"],
): string | undefined =>
  typeof contactInbox === "string" ? contactInbox : contactInbox?.id

/**
 * The one worker implementation of "set a custom field" shared by the flow
 * step and the trigger action: resolve `{{variables}}`, then hand the
 * operation to the business layer (lock, calculate, write, emit). A rejection
 * the calculator reports comes back as an outcome; anything else throws.
 */
export async function applyCustomFieldOperation(
  target: CustomFieldOperationTarget,
  context: CustomFieldOperationContext,
): Promise<CustomFieldOperationOutcome> {
  const { conversation, contactInbox, sentByUserId } = context
  // The value can contain {{variable}} tokens inserted via the editor (contact
  // fields, coupons, etc.); resolve them against this contact before persisting.
  // Unresolvable tokens are left as-is, and a value that resolves to empty still
  // falls through to the temporal "now" handling.
  const value = target.value.includes(VARIABLE_TOKEN)
    ? await contactVariableService.replaceAll({
        text: target.value,
        variables: await contactVariableService.getAll({
          contactId: context.contactId,
          contactInbox,
          conversation,
          sentByUserId,
        }),
      })
    : target.value

  try {
    await contactCustomFieldService.setValueByKey({
      workspaceId: context.workspaceId,
      contactId: context.contactId,
      keyword: target.fieldReference,
      value,
      // The editor captured its browser zone at save time; anchor naive
      // date/datetime values to it (worker has no browser context).
      sourceTimezoneOverride: target.timezone,
      ...context.valueOptions,
      contactInboxId: contactInboxIdOf(contactInbox),
      allowBotFields: true,
      operation: target.operation,
    })
  } catch (error: unknown) {
    if (
      error instanceof ChatbotXException &&
      error.code === "invalidFieldOperation"
    ) {
      return {
        status: "rejected",
        reason: String(error.data?.reason ?? error.code),
      }
    }
    throw error
  }
  return { status: "applied" }
}
