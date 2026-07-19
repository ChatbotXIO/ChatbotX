"use server"

import {
  type ContactAccessScope,
  contactCustomFieldService,
  contactService,
} from "@chatbotx.io/business"
import { and, db, eq, findOrFail } from "@chatbotx.io/database/client"
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
import { requireContactPermissionScope } from "../permissions"
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
    const accessScope = await requireContactPermissionScope(workspaceId)

    await addContactCustomFields({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
      accessScope,
    })
  })

const computeUpdatedFieldValue = ({
  currentValue,
  operation,
  operationValue,
}: {
  currentValue: string
  operation: FieldOperationType
  operationValue: string
}): string | null => {
  switch (operation) {
    case FieldOperationType.append:
      return currentValue + operationValue
    case FieldOperationType.prepend:
      return operationValue + currentValue
    case FieldOperationType.increase:
    case FieldOperationType.decrease: {
      const currentNumber = Number(currentValue)
      const operationNumber = Number(operationValue)
      if (Number.isNaN(currentNumber) || Number.isNaN(operationNumber)) {
        return null
      }
      const updatedNumber =
        operation === FieldOperationType.increase
          ? currentNumber + operationNumber
          : currentNumber - operationNumber
      return String(updatedNumber)
    }
    default:
      return operationValue
  }
}

export const addContactCustomFields = async ({
  bindArgsParsedInputs: [workspaceId],
  parsedInput,
  accessScope,
}: {
  bindArgsParsedInputs: WorkspaceIdRequestParams
  parsedInput: AddContactCustomFieldRequest
  accessScope?: ContactAccessScope
}) => {
  const contacts = await contactService.findManyByIds({
    workspaceId,
    ids: parsedInput.ids,
    accessScope,
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

  const changes: Array<{
    contactId: string
    oldValue: string | null
    newValue: string
  }> = []

  await db.transaction(async (tx) => {
    await Promise.all(
      contacts.map(async (contact) => {
        const [contactCustomField] = await tx
          .select()
          .from(contactCustomFieldModel)
          .where(
            and(
              eq(contactCustomFieldModel.contactId, contact.id),
              eq(contactCustomFieldModel.customFieldId, customField.id),
            ),
          )
          .for("update")

        if (contactCustomField) {
          const value = computeUpdatedFieldValue({
            currentValue: contactCustomField.value,
            operation: parsedInput.operation,
            operationValue: parsedInput.value,
          })

          if (value === null || value === contactCustomField.value) {
            return
          }

          changes.push({
            contactId: contact.id,
            oldValue: contactCustomField.value,
            newValue: value,
          })

          return tx
            .update(contactCustomFieldModel)
            .set({
              value,
            })
            .where(eq(contactCustomFieldModel.id, contactCustomField.id))
        }

        changes.push({
          contactId: contact.id,
          oldValue: null,
          newValue: parsedInput.value,
        })

        return tx
          .insert(contactCustomFieldModel)
          .values({
            contactId: contact.id,
            customFieldId: customField.id,
            value: parsedInput.value,
            id: createId(),
          })
          .onConflictDoUpdate({
            target: [
              contactCustomFieldModel.contactId,
              contactCustomFieldModel.customFieldId,
            ],
            set: { value: parsedInput.value },
          })
      }),
    )
  })

  for (const change of changes) {
    await emitCustomFieldChanged(
      workspaceId,
      change.contactId,
      customField.id,
      customField.name,
      change.oldValue,
      change.newValue,
    )
  }
}

export const setContactCustomFieldValue = async ({
  workspaceId,
  contactId,
  customFieldId,
  value,
  accessScope,
}: {
  workspaceId: string
  contactId: string
  customFieldId: string
  value: string
  accessScope?: ContactAccessScope
}) => {
  await contactService.findByIdOrFail({
    workspaceId,
    id: contactId,
    accessScope,
  })

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

  if (contactCustomField?.value === value) {
    return
  }

  if (contactCustomField) {
    await db
      .update(contactCustomFieldModel)
      .set({
        value,
      })
      .where(eq(contactCustomFieldModel.id, contactCustomField.id))
  } else {
    await db
      .insert(contactCustomFieldModel)
      .values({
        contactId,
        customFieldId,
        value,
        id: createId(),
      })
      .onConflictDoUpdate({
        target: [
          contactCustomFieldModel.contactId,
          contactCustomFieldModel.customFieldId,
        ],
        set: { value },
      })
  }

  await emitCustomFieldChanged(
    workspaceId,
    contactId,
    customField.id,
    customField.name,
    contactCustomField?.value ?? null,
    value,
  )
}

export const setContactCustomFieldValues = async ({
  workspaceId,
  contactId,
  fields,
  accessScope,
}: {
  workspaceId: string
  contactId: string
  fields: Array<{ customFieldId: string; value: string }>
  accessScope?: ContactAccessScope
}) => {
  await contactService.findByIdOrFail({
    workspaceId,
    id: contactId,
    accessScope,
  })

  await contactCustomFieldService.setValues({ workspaceId, contactId, fields })
}
