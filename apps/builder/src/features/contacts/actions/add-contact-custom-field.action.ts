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
import { FieldOperationType } from "@chatbotx.io/flow-config"
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
    newValue: string
  }> = []

  // Persist inside the transaction, collecting the pending change per contact so
  // their events can be emitted only after commit. The trigger worker re-reads
  // the value from the DB, so a mid-transaction emit could observe uncommitted
  // or rolled-back data.
  const persistedByContact = await db.transaction(async (tx) => {
    for (const contact of contacts) {
      const [contactCustomField] = await tx
        .select({
          value: contactCustomFieldModel.value,
        })
        .from(contactCustomFieldModel)
        .where(
          and(
            eq(contactCustomFieldModel.contactId, contact.id),
            eq(contactCustomFieldModel.customFieldId, customField.id),
          ),
        )
        .for("update")
        .limit(1)

      const value = contactCustomField
        ? computeUpdatedFieldValue({
            currentValue: contactCustomField.value,
            operation: parsedInput.operation,
            operationValue: parsedInput.value,
          })
        : parsedInput.value

      if (value === null || value === contactCustomField?.value) {
        continue
      }

      changes.push({
        contactId: contact.id,
        newValue: value,
      })
    }

    return await Promise.all(
      changes.map(async (change) => ({
        contactId: change.contactId,
        changes: await contactCustomFieldService.setValuesInTransaction(
          {
            workspaceId,
            contactId: change.contactId,
            fields: [{ customFieldId: customField.id, value: change.newValue }],
            sourceTimezone: parsedInput.clientTimezone,
          },
          tx,
        ),
      })),
    )
  })

  await Promise.all(
    persistedByContact.map((contact) =>
      contactCustomFieldService.emitCustomFieldChanges({
        workspaceId,
        contactId: contact.contactId,
        changes: contact.changes,
      }),
    ),
  )
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

  await contactCustomFieldService.setValues({
    workspaceId,
    contactId,
    fields: [{ customFieldId: customField.id, value }],
  })
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
