"use server"

import { contactService } from "@chatbotx.io/business"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import {
  contactCustomFieldModel,
  customFieldModel,
} from "@chatbotx.io/database/schema"
import { emitCustomFieldChanged } from "@chatbotx.io/events"
import { FieldOperationType } from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type AddContactCustomFieldRequest,
  addContactCustomFieldRequest,
} from "../schemas/contact-custom-field"

export const addContactCustomFieldAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(addContactCustomFieldRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    } = props

    await addContactCustomFields({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    })
  })

export const addContactCustomFields = async ({
  bindArgsParsedInputs: [workspaceId],
  parsedInput,
}: {
  bindArgsParsedInputs: WorkspaceIdRequestParams
  parsedInput: AddContactCustomFieldRequest
}) => {
  const contacts = await contactService.findManyByIds({
    workspaceId,
    ids: parsedInput.ids,
  })
  if (contacts.length === 0) {
    return
  }

  const customField = await findOrFail({
    table: customFieldModel,
    where: {
      workspaceId,
      id: parsedInput.customFieldId,
    },
    message: "Custom field not found",
  })

  await db.transaction(async (tx) => {
    await Promise.all(
      contacts.map(async (contact) => {
        const contactCustomField =
          await tx.query.contactCustomFieldModel.findFirst({
            where: {
              contactId: contact.id,
              customFieldId: customField.id,
            },
          })

        if (contactCustomField) {
          let value = ""
          switch (parsedInput.operation) {
            case FieldOperationType.append:
              value = contactCustomField.value + String(parsedInput.value)
              break
            case FieldOperationType.prepend:
              value = String(parsedInput.value) + contactCustomField.value
              break
            case FieldOperationType.increase:
              value = String(
                Number(contactCustomField.value) + Number(parsedInput.value),
              )
              break
            case FieldOperationType.decrease:
              value = String(
                Number(contactCustomField.value) - Number(parsedInput.value),
              )
              break
            default:
              value = parsedInput.value as string
          }

          return tx
            .update(contactCustomFieldModel)
            .set({
              value,
            })
            .where(eq(contactCustomFieldModel.id, contactCustomField.id))
        }

        return tx.insert(contactCustomFieldModel).values({
          contactId: contact.id,
          customFieldId: customField.id,
          value: parsedInput.value as string,
          id: createId(),
        })
      }),
    )
  })

  for (const contact of contacts) {
    await emitCustomFieldChanged(
      workspaceId,
      contact.id,
      customField.id,
      customField.name,
      null,
      parsedInput.value,
    )
  }
}

export const setContactCustomFieldValue = async ({
  workspaceId,
  contactId,
  customFieldId,
  value,
}: {
  workspaceId: string
  contactId: string
  customFieldId: string
  value: string
}) => {
  // Get custom field info for event emission
  const customField = await db.query.customFieldModel.findFirst({
    where: {
      id: customFieldId,
      workspaceId,
    },
    columns: {
      id: true,
      name: true,
    },
  })

  if (!customField) {
    throw new Error("Custom field not found")
  }

  const contactCustomField = await db.query.contactCustomFieldModel.findFirst({
    where: {
      contactId,
      customFieldId,
    },
  })

  if (contactCustomField) {
    await db
      .update(contactCustomFieldModel)
      .set({
        value,
      })
      .where(eq(contactCustomFieldModel.id, contactCustomField.id))
  } else {
    await db.insert(contactCustomFieldModel).values({
      contactId,
      customFieldId,
      value,
      id: createId(),
    })
  }

  await emitCustomFieldChanged(
    workspaceId,
    contactId,
    customField.id,
    customField.name,
    null,
    value,
  )
}

export const setContactCustomFieldValues = async ({
  workspaceId,
  contactId,
  fields,
}: {
  workspaceId: string
  contactId: string
  fields: Array<{ customFieldId: string; value: string }>
}) => {
  const customFieldIds = fields.map((f) => f.customFieldId)

  const customFields = await db.query.customFieldModel.findMany({
    where: { workspaceId, id: { in: customFieldIds } },
    columns: { id: true, name: true },
  })

  if (customFields.length === 0) {
    return
  }

  const existingValues = await db.query.contactCustomFieldModel.findMany({
    where: { contactId, customFieldId: { in: customFieldIds } },
  })

  await db.transaction(async (tx) => {
    const matchedFields = customFields.flatMap((customField) => {
      const field = fields.find((f) => f.customFieldId === customField.id)
      return field ? [{ customField, field }] : []
    })

    await Promise.all(
      matchedFields.map(({ customField, field }) => {
        const existing = existingValues.find(
          (v) => v.customFieldId === customField.id,
        )

        if (existing) {
          return tx
            .update(contactCustomFieldModel)
            .set({ value: field.value })
            .where(eq(contactCustomFieldModel.id, existing.id))
        }

        return tx.insert(contactCustomFieldModel).values({
          id: createId(),
          contactId,
          customFieldId: customField.id,
          value: field.value,
        })
      }),
    )
  })

  for (const customField of customFields) {
    const field = fields.find((f) => f.customFieldId === customField.id)
    if (!field) {
      continue
    }
    emitCustomFieldChanged(
      workspaceId,
      contactId,
      customField.id,
      customField.name,
      null,
      field.value,
    )
  }
}
