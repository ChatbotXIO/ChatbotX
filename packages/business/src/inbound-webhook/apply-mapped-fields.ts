import type { GenderType } from "@chatbotx.io/database/partials"
import { TemporalInputParsing } from "@chatbotx.io/utils/datetime"
import {
  contactService,
  isRichSystemContactField,
  type RichSystemContactField,
} from "../contact/service"
import { contactCustomFieldService } from "../contact-custom-field/service"
import type { ExtractedField } from "./extract"

/** Fields that passed extraction and carry something to write. */
export const writableFields = (fields: ExtractedField[]): ExtractedField[] =>
  fields.filter((field) => field.value !== null && field.error === null)

export const toRichSystemFields = (
  fields: ExtractedField[],
): Partial<Record<RichSystemContactField, string>> => {
  // Later rows win, including their position: a repeated target moves to the
  // end so it is applied after the rows between its two occurrences.
  const byTarget = new Map<RichSystemContactField, string>()
  for (const { kind, target, value } of fields) {
    if (
      kind === "richSystem" &&
      value !== null &&
      isRichSystemContactField(target)
    ) {
      byTarget.delete(target)
      byTarget.set(target, value)
    }
  }
  return Object.fromEntries(byTarget)
}

/**
 * Writes the extracted fields onto the contact with the fewest statements: one
 * update for every system field, one for gender, one batch for all custom
 * fields. Callers pass only `writableFields` — rejected values were already
 * reported by extraction, so nothing here can fail on bad input.
 */
export const applyMappedContactFields = async (input: {
  workspaceId: string
  contactId: string
  contactInboxId?: string
  fields: ExtractedField[]
}): Promise<void> => {
  const { workspaceId, contactId, contactInboxId, fields } = input

  const richFields = toRichSystemFields(fields)
  if (Object.keys(richFields).length > 0) {
    await contactService.applyRichSystemFields({
      workspaceId,
      contactId,
      fields: richFields,
    })
  }

  const gender = fields.findLast(({ kind }) => kind === "gender")?.value
  if (gender) {
    await contactService.update(
      { workspaceId, id: contactId },
      { gender: gender as GenderType },
    )
  }

  const customFields = fields.flatMap(({ kind, target, value }) =>
    kind === "customField" && value !== null
      ? [{ customFieldId: target, value }]
      : [],
  )
  if (customFields.length > 0) {
    await contactCustomFieldService.setValues({
      workspaceId,
      contactId,
      contactInboxId,
      fields: customFields,
      temporalInputParsing: TemporalInputParsing.Lenient,
    })
  }
}
