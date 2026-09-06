import { db } from "@chatbotx.io/database/client"
import {
  type FillableContactKey,
  fillableContactKeys,
  genderTypes,
} from "@chatbotx.io/database/partials"
import type { ContactModel } from "@chatbotx.io/database/types"
import { isNumericId } from "@chatbotx.io/utils"
import { dispatchAuditRecord } from "../audit/dispatcher"
import { contactCustomFieldService } from "../contact-custom-field/service"
import { contactInboxService } from "../contact-inbox/service"
import { normalizeLanguage, normalizeStoredTimezone } from "../contact-locale"
import { customFieldService } from "../custom-field/service"
import { emitContactInfoChangeEvents } from "./contact-info-changes"
import { type ContactAccessScope, contactService } from "./service"

const contactInboxIdField = "contactInboxId"
const clientTimezoneField = "clientTimezone"

export const updateFieldsAndCustomFields = async (
  ctx: {
    workspaceId: string
    id: string
    accessScope?: ContactAccessScope
  },
  parsedInput: Record<string, string>,
) => {
  const existingContact = await contactService.findByIdOrFail({
    workspaceId: ctx.workspaceId,
    id: ctx.id,
    accessScope: ctx.accessScope,
  })

  // Prepare data
  const submittedContactFields: Partial<ContactModel> = {}
  const contactFields: Partial<ContactModel> = {}
  const candidateCustomFieldValues: Record<string, string> = {}
  const contactInboxId = parsedInput[contactInboxIdField]
  const clientTimezone = parsedInput[clientTimezoneField]
  const language = normalizeLanguage(parsedInput.language)

  for (const [key, value] of Object.entries(parsedInput)) {
    if (
      key === contactInboxIdField ||
      key === "language" ||
      key === clientTimezoneField
    ) {
      continue
    }

    if (fillableContactKeys.includes(key as FillableContactKey)) {
      assignContactFieldValue(
        submittedContactFields,
        key as FillableContactKey,
        value,
      )
    } else if (isNumericId(key)) {
      // Not a fillable contact key — only a numeric key can be a custom
      // field id; `writeValues` re-validates the id against the workspace
      // below, so this is just a cheap pre-filter, not the source of truth.
      candidateCustomFieldValues[key] = value
    }
  }

  const candidateCustomFieldIds = Object.keys(candidateCustomFieldValues)
  const matchedCustomFields =
    candidateCustomFieldIds.length > 0
      ? await customFieldService.findManyByIds({
          workspaceId: ctx.workspaceId,
          ids: candidateCustomFieldIds,
        })
      : []
  const matchedCustomFieldIds = new Set(
    matchedCustomFields.map((field) => field.id),
  )
  const customFields: Record<string, string> = {}
  for (const [key, value] of Object.entries(candidateCustomFieldValues)) {
    if (matchedCustomFieldIds.has(key)) {
      customFields[key] = value
    }
  }

  for (const [key, value] of Object.entries(submittedContactFields) as [
    FillableContactKey,
    ContactModel[FillableContactKey],
  ][]) {
    if (value !== existingContact[key]) {
      contactFields[key] = value
    }
  }

  const hasCustomFields = Object.keys(customFields).length > 0
  const shouldUpdateContactFields = Object.keys(contactFields).length > 0

  let shouldUpdateLanguage = false
  if (contactInboxId && language) {
    const contactInbox = await contactInboxService.findByUncached({
      where: { id: contactInboxId, contactId: ctx.id },
    })
    shouldUpdateLanguage = contactInbox
      ? language !== contactInbox.language
      : false
  }

  if (!(shouldUpdateContactFields || shouldUpdateLanguage || hasCustomFields)) {
    return
  }

  const customFieldChanges = await db.transaction(async (tx) => {
    if (shouldUpdateContactFields) {
      await contactService.update(ctx, contactFields, tx)
    }

    if (shouldUpdateLanguage && contactInboxId && language) {
      await contactInboxService.updateLanguage({
        tx,
        workspaceId: ctx.workspaceId,
        contactId: ctx.id,
        contactInboxId,
        language,
      })
    }

    if (!hasCustomFields) {
      return []
    }

    return await contactCustomFieldService.setValuesInTransaction(
      {
        workspaceId: ctx.workspaceId,
        contactId: ctx.id,
        fields: Object.entries(customFields).map(([customFieldId, value]) => ({
          customFieldId,
          value,
        })),
        sourceTimezone: clientTimezone,
      },
      tx,
    )
  })

  const hasRealChange =
    shouldUpdateContactFields ||
    shouldUpdateLanguage ||
    customFieldChanges.length > 0

  if (!hasRealChange) {
    return
  }

  await dispatchAuditRecord({
    workspaceId: ctx.workspaceId,
    action: "update",
    detail: `updated a contact (#${ctx.id})`,
  })

  if (shouldUpdateContactFields) {
    await emitContactInfoChangeEvents(
      ctx.workspaceId,
      ctx.id,
      existingContact,
      {
        phoneNumber: contactFields.phoneNumber ?? existingContact.phoneNumber,
        email: contactFields.email ?? existingContact.email,
      },
    )
  }

  // Emit custom-field change events only after the transaction commits: the
  // trigger worker re-reads the value from the DB, so a mid-transaction emit
  // could surface uncommitted or rolled-back data.
  if (customFieldChanges.length > 0) {
    await contactCustomFieldService.emitCustomFieldChanges({
      workspaceId: ctx.workspaceId,
      contactId: ctx.id,
      changes: customFieldChanges,
    })
  }
}

const assignContactFieldValue = (
  contactFields: Partial<ContactModel>,
  key: FillableContactKey,
  value: string,
) => {
  switch (key) {
    case "phoneNumber":
      contactFields.phoneNumber = value
      break
    case "email":
      contactFields.email = value
      break
    case "firstName":
      contactFields.firstName = value
      break
    case "lastName":
      contactFields.lastName = value
      break
    case "gender": {
      const parsedGender = genderTypes.safeParse(value)
      if (parsedGender.success) {
        contactFields.gender = parsedGender.data
      }
      break
    }
    case "timezone":
      contactFields.timezone = normalizeStoredTimezone(value) ?? value
      break
    default: {
      const exhaustiveKey: never = key
      return exhaustiveKey
    }
  }
}
