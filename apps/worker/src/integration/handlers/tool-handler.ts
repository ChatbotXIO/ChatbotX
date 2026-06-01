import { and, db, inArray } from "@chatbotx.io/database/client"
import {
  contactCustomFieldModel,
  customFieldModel,
} from "@chatbotx.io/database/schema"
import { emitCustomFieldChanged } from "@chatbotx.io/events"
import {
  type CountCharactersStepSchema,
  type FormatDateStepSchema,
  type GenerateCodeStepSchema,
  GenerateCodeType,
  type GetDataFromJsonStepSchema,
} from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import { faker } from "@faker-js/faker"
import { format } from "date-fns"
import { getProperty } from "dot-prop"
import type { ExecuteStepProps } from "./flow"

export async function countCharacters({
  conversation,
  step,
}: ExecuteStepProps<CountCharactersStepSchema>) {
  const customFieldIds = [step.inputFieldId, step.outputFieldId]
  const customFieldsCount = await db.$count(
    customFieldModel,
    and(inArray(customFieldModel.id, customFieldIds)),
  )
  if (customFieldsCount !== 2) {
    return
  }

  // Find target contact custom field
  const targetContactCustomField =
    await db.query.contactCustomFieldModel.findFirst({
      where: {
        customFieldId: step.inputFieldId,
      },
    })
  if (!targetContactCustomField) {
    return
  }

  const value = `${`${targetContactCustomField.value}`.length}`

  // Get existing value and custom field name
  const existing = await db.query.contactCustomFieldModel.findFirst({
    where: {
      contactId: conversation.contactId,
      customFieldId: step.outputFieldId,
    },
    columns: { value: true },
  })

  const customField = await db.query.customFieldModel.findFirst({
    where: { id: step.outputFieldId },
    columns: { name: true },
  })

  await db
    .insert(contactCustomFieldModel)
    .values({
      id: createId(),
      value,
      contactId: conversation.contactId,
      customFieldId: step.outputFieldId,
    })
    .onConflictDoUpdate({
      target: [
        contactCustomFieldModel.contactId,
        contactCustomFieldModel.customFieldId,
      ],
      set: {
        value,
      },
    })

  await emitCustomFieldChanged(
    conversation.workspaceId,
    conversation.contactId,
    step.outputFieldId,
    customField?.name || step.outputFieldId,
    existing?.value || null,
    value,
  )
}

export async function formatDate({
  conversation,
  step,
}: ExecuteStepProps<FormatDateStepSchema>) {
  const inputContactCustomField =
    await db.query.contactCustomFieldModel.findFirst({
      where: {
        customFieldId: step.inputFieldId,
        contactId: conversation.contactId,
      },
    })
  if (!inputContactCustomField) {
    return
  }

  const newValue = format(new Date(inputContactCustomField.value), step.format)

  // Get existing value and custom field name
  const existing = await db.query.contactCustomFieldModel.findFirst({
    where: {
      contactId: conversation.contactId,
      customFieldId: step.outputFieldId,
    },
    columns: { value: true },
  })

  const customField = await db.query.customFieldModel.findFirst({
    where: { id: step.outputFieldId },
    columns: { name: true },
  })

  await db
    .insert(contactCustomFieldModel)
    .values({
      id: createId(),
      value: newValue,
      contactId: conversation.contactId,
      customFieldId: step.outputFieldId,
    })
    .onConflictDoUpdate({
      target: [
        contactCustomFieldModel.contactId,
        contactCustomFieldModel.customFieldId,
      ],
      set: {
        value: newValue,
      },
    })

  await emitCustomFieldChanged(
    conversation.workspaceId,
    conversation.contactId,
    step.outputFieldId,
    customField?.name || step.outputFieldId,
    existing?.value || null,
    newValue,
  )
}

export async function generateCode({
  conversation,
  step,
}: ExecuteStepProps<GenerateCodeStepSchema>) {
  let value: string | null = null
  switch (step.type) {
    case GenerateCodeType.NUMERIC_LENGTH: {
      const min = 10 ** (step.min - 1)
      const max = 10 ** step.max - 1
      value = `${faker.number.int({ min, max })}`
      break
    }
    case GenerateCodeType.NUMERIC_VALUE: {
      value = `${faker.number.int({ min: step.min, max: step.max })}`
      break
    }
    case GenerateCodeType.ALPHANUMERIC_LENGTH: {
      value = faker.string.alpha({ length: { min: step.min, max: step.max } })
      break
    }
    default:
      break
  }

  if (value) {
    // Get existing value and custom field name
    const existing = await db.query.contactCustomFieldModel.findFirst({
      where: {
        contactId: conversation.contactId,
        customFieldId: step.outputFieldId,
      },
      columns: { value: true },
    })

    const customField = await db.query.customFieldModel.findFirst({
      where: { id: step.outputFieldId },
      columns: { name: true },
    })

    await db
      .insert(contactCustomFieldModel)
      .values({
        id: createId(),
        value,
        contactId: conversation.contactId,
        customFieldId: step.outputFieldId,
      })
      .onConflictDoUpdate({
        target: [
          contactCustomFieldModel.contactId,
          contactCustomFieldModel.customFieldId,
        ],
        set: {
          value,
        },
      })

    await emitCustomFieldChanged(
      conversation.workspaceId,
      conversation.contactId,
      step.outputFieldId,
      customField?.name || step.outputFieldId,
      existing?.value || null,
      value,
    )
  }
}

export async function getDataFromJSON({
  conversation,
  step,
}: ExecuteStepProps<GetDataFromJsonStepSchema>) {
  const inputValue = await db.query.contactCustomFieldModel.findFirst({
    where: {
      contactId: conversation.contactId,
      customFieldId: step.inputFieldId,
    },
  })
  if (!inputValue) {
    return
  }

  const dataJSON = JSON.parse(inputValue.value)
  const mapping = step.mapping as {
    jsonPath: string
    outputFieldId: string
  }[]

  // Find valid custom fields
  const validCustomFields = await db.query.customFieldModel.findMany({
    where: {
      workspaceId: conversation.workspaceId,
      id: {
        in: mapping.map((m) => m.outputFieldId),
      },
    },
    columns: {
      id: true,
      name: true,
    },
  })
  const validCustomFieldIds = validCustomFields.map((v) => v.id)
  const customFieldMap = new Map(validCustomFields.map((f) => [f.id, f.name]))

  const updatedFields = await db.transaction(async (tx) => {
    const updated: Array<{
      customFieldId: string
      customFieldName: string
      oldValue: string | null
      newValue: string
    }> = []

    for (const data of mapping) {
      if (validCustomFieldIds.includes(data.outputFieldId)) {
        const value = getProperty(dataJSON, data.jsonPath)

        if (value) {
          const encodedValue = JSON.stringify(value)

          // Get existing value
          const existing = await tx.query.contactCustomFieldModel.findFirst({
            where: {
              contactId: conversation.contactId,
              customFieldId: data.outputFieldId,
            },
            columns: { value: true },
          })

          await tx
            .insert(contactCustomFieldModel)
            .values({
              id: createId(),
              value: encodedValue,
              contactId: conversation.contactId,
              customFieldId: data.outputFieldId,
            })
            .onConflictDoUpdate({
              target: [
                contactCustomFieldModel.contactId,
                contactCustomFieldModel.customFieldId,
              ],
              set: {
                value: encodedValue,
              },
            })

          updated.push({
            customFieldId: data.outputFieldId,
            customFieldName:
              customFieldMap.get(data.outputFieldId) || data.outputFieldId,
            oldValue: existing?.value || null,
            newValue: encodedValue,
          })
        }
      }
    }

    return updated
  })

  for (const field of updatedFields) {
    await emitCustomFieldChanged(
      conversation.workspaceId,
      conversation.contactId,
      field.customFieldId,
      field.customFieldName,
      field.oldValue,
      field.newValue,
    )
  }
}
