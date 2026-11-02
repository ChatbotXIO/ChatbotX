import {
  botFieldService,
  contactCustomFieldService,
} from "@chatbotx.io/business"
import {
  FieldReferenceKind,
  parseFieldReference,
  setCustomFieldActionSchema,
} from "@chatbotx.io/flow-config"
import baseLogger from "@chatbotx.io/logger"
import { applyCustomFieldOperation } from "../../../integration/handlers/custom-field-operation"
import { skipped, succeeded, type TriggerActionHandler } from "./types"

export const setCustomField: TriggerActionHandler = async ({
  context,
  conversation,
}) => {
  const parsed = setCustomFieldActionSchema.safeParse(context.action)
  if (!parsed.success) {
    return skipped("invalidAction")
  }
  const { customFieldId, operation, value, timezone } = parsed.data

  const outcome = await applyCustomFieldOperation(
    { fieldReference: customFieldId, operation, value, timezone },
    {
      workspaceId: context.workspaceId,
      contactId: conversation.contactId,
      conversation,
      // The inbox the event was threaded with, never a fresh lookup: only the
      // inbox-consuming actions resolve one.
      contactInbox: context.contactInboxId ?? null,
      valueOptions: {},
    },
  )
  return outcome.status === "applied"
    ? succeeded
    : skipped(`invalidFieldOperation:${outcome.reason}`)
}

export const clearCustomField: TriggerActionHandler = async ({
  context,
  conversation,
}) => {
  const { action, workspaceId } = context
  const customFieldId = action.customFieldId as string
  const fieldReference = parseFieldReference(customFieldId)
  switch (fieldReference.kind) {
    case FieldReferenceKind.botField:
      await botFieldService.clearValueByKey({
        workspaceId,
        key: fieldReference.id,
      })
      break
    case FieldReferenceKind.customField:
      await contactCustomFieldService.deleteByCustomFieldId({
        workspaceId,
        contactIds: [conversation.contactId],
        customFieldId,
      })
      break
    default: {
      const _exhaustive: never = fieldReference
      baseLogger.warn(
        { fieldReference: _exhaustive },
        "Unhandled field reference kind in clearCustomField",
      )
    }
  }
  return succeeded
}
