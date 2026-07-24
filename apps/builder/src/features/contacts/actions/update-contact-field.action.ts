"use server"

import {
  type ContactAccessScope,
  contactCustomFieldService,
  contactInboxService,
  contactService,
  emitContactInfoChangeEvents,
  normalizeLanguage,
  normalizeStoredTimezone,
} from "@chatbotx.io/business"
import { db } from "@chatbotx.io/database/client"
import {
  type FillableContactKey,
  fillableContactKeys,
  genderTypes,
} from "@chatbotx.io/database/partials"
import type { ContactModel } from "@chatbotx.io/database/types"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { listCustomFields } from "@/features/custom-fields/queries"
import { listCustomFieldsSearchParams } from "@/features/custom-fields/schemas/query"
import { workspaceActionClient } from "@/lib/safe-action"
import { maxPerPageString } from "@/lib/shared-request"
import { requireContactPermissionScope } from "../permissions"
import {
  type UpdateContactFieldRequest,
  updateContactFieldRequest,
} from "../schemas/action"

const contactInboxIdField = "contactInboxId"
const clientTimezoneField = "clientTimezone"

export const updateContactFieldAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateContactFieldRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props
    const accessScope = await requireContactPermissionScope(workspaceId)

    await updateContactFields({ workspaceId, id, accessScope }, parsedInput)
  })

export const updateContactFields = async (
  ctx: {
    workspaceId: string
    id: string
    accessScope?: ContactAccessScope
  },
  parsedInput: UpdateContactFieldRequest,
) => {
  const existingContact = await contactService.findByIdOrFail({
    workspaceId: ctx.workspaceId,
    id: ctx.id,
    accessScope: ctx.accessScope,
  })

  const allCustomFields = await listCustomFields({
    workspaceId: ctx.workspaceId,
    ...listCustomFieldsSearchParams.parse({
      perPage: maxPerPageString,
    }),
  })
  const allCustomFieldsMap = new Map(
    allCustomFields.data.map((field) => [field.id.toString(), field]),
  )

  // Prepare data
  const contactFields: Partial<ContactModel> = {}
  const customFields: Record<string, string> = {}
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
      assignContactFieldValue(contactFields, key as FillableContactKey, value)
    } else if (allCustomFieldsMap.has(key)) {
      customFields[key] = value
    }
  }

  const hasCustomFields = Object.keys(customFields).length > 0

  const customFieldChanges = await db.transaction(async (tx) => {
    if (Object.keys(contactFields).length > 0) {
      await contactService.update(ctx, contactFields, tx)
    }

    if (contactInboxId && language) {
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

  await emitContactInfoChangeEvents(ctx.workspaceId, ctx.id, existingContact, {
    phoneNumber: contactFields.phoneNumber ?? existingContact.phoneNumber,
    email: contactFields.email ?? existingContact.email,
  })

  // Emit custom-field change events only after the transaction commits: the
  // trigger worker re-reads the value from the DB, so a mid-transaction emit
  // could surface uncommitted or rolled-back data.
  if (hasCustomFields) {
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
