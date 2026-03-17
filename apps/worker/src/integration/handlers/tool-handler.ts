import { and, db, inArray } from "@aha.chat/database/client"
import {
  contactCustomFieldModel,
  customFieldModel,
} from "@aha.chat/database/schema"
import {
  type CountCharactersStepSchema,
  type FormatDateStepSchema,
  type GenerateCodeStepSchema,
  GenerateCodeType,
  type GetDataFromJsonStepSchema,
} from "@aha.chat/flow-config"
import { emitCustomFieldChanged } from "@chatbotx/events"
import { faker } from "@faker-js/faker"
import { createId } from "@paralleldrive/cuid2"
import { format } from "date-fns"
import { getProperty } from "dot-prop"
import type { ExecuteStepProps } from "./flow"

export async function countCharacters({
  conversation,
  step,
}: ExecuteStepProps<CountCharactersStepSchema>) {
  const customFieldIds = [step.inputCfId, step.outputCfId]
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
        customFieldId: step.inputCfId,
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
      customFieldId: step.outputCfId,
    },
    columns: { value: true },
  })

  const customField = await db.query.customFieldModel.findFirst({
    where: { id: step.outputCfId },
    columns: { name: true },
  })

  await db
    .insert(contactCustomFieldModel)
    .values({
      id: createId(),
      value,
      contactId: conversation.contactId,
      customFieldId: step.outputCfId,
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

  // Emit custom field changed event
  try {
    await emitCustomFieldChanged(
      conversation.chatbotId,
      conversation.contactId,
      step.outputCfId,
      customField?.name || step.outputCfId,
      existing?.value || null,
      value,
    )
  } catch (error) {
    console.error("Failed to emit customFieldChanged event:", error)
  }
}

export async function formatDate({
  conversation,
  step,
}: ExecuteStepProps<FormatDateStepSchema>) {
  const inputContactCustomField =
    await db.query.contactCustomFieldModel.findFirst({
      where: {
        customFieldId: step.inputCfId,
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
      customFieldId: step.outputCfId,
    },
    columns: { value: true },
  })

  const customField = await db.query.customFieldModel.findFirst({
    where: { id: step.outputCfId },
    columns: { name: true },
  })

  await db
    .insert(contactCustomFieldModel)
    .values({
      id: createId(),
      value: newValue,
      contactId: conversation.contactId,
      customFieldId: step.outputCfId,
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

  // Emit custom field changed event
  try {
    await emitCustomFieldChanged(
      conversation.chatbotId,
      conversation.contactId,
      step.outputCfId,
      customField?.name || step.outputCfId,
      existing?.value || null,
      newValue,
    )
  } catch (error) {
    console.error("Failed to emit customFieldChanged event:", error)
  }
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
        customFieldId: step.outputCfId,
      },
      columns: { value: true },
    })

    const customField = await db.query.customFieldModel.findFirst({
      where: { id: step.outputCfId },
      columns: { name: true },
    })

    await db
      .insert(contactCustomFieldModel)
      .values({
        id: createId(),
        value,
        contactId: conversation.contactId,
        customFieldId: step.outputCfId,
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

    // Emit custom field changed event
    try {
      await emitCustomFieldChanged(
        conversation.chatbotId,
        conversation.contactId,
        step.outputCfId,
        customField?.name || step.outputCfId,
        existing?.value || null,
        value,
      )
    } catch (error) {
      console.error("Failed to emit customFieldChanged event:", error)
    }
  }
}

export async function getDataFromJSON({
  conversation,
  step,
}: ExecuteStepProps<GetDataFromJsonStepSchema>) {
  const inputValue = await db.query.contactCustomFieldModel.findFirst({
    where: {
      contactId: conversation.contactId,
      customFieldId: step.inputCfId,
    },
  })
  if (!inputValue) {
    return
  }

  const dataJSON = JSON.parse(inputValue.value)
  const mapping = step.mapping as {
    jsonPath: string
    outputCfId: string
  }[]

  // Find valid custom fields
  const validCustomFields = await db.query.customFieldModel.findMany({
    where: {
      chatbotId: conversation.chatbotId,
      id: {
        in: mapping.map((m) => m.outputCfId),
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
      if (validCustomFieldIds.includes(data.outputCfId)) {
        const value = getProperty(dataJSON, data.jsonPath)

        if (value) {
          const encodedValue = JSON.stringify(value)

          // Get existing value
          const existing = await tx.query.contactCustomFieldModel.findFirst({
            where: {
              contactId: conversation.contactId,
              customFieldId: data.outputCfId,
            },
            columns: { value: true },
          })

          await tx
            .insert(contactCustomFieldModel)
            .values({
              id: createId(),
              value: encodedValue,
              contactId: conversation.contactId,
              customFieldId: data.outputCfId,
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
            customFieldId: data.outputCfId,
            customFieldName:
              customFieldMap.get(data.outputCfId) || data.outputCfId,
            oldValue: existing?.value || null,
            newValue: encodedValue,
          })
        }
      }
    }

    return updated
  })

  // Emit custom field changed events
  for (const field of updatedFields) {
    try {
      await emitCustomFieldChanged(
        conversation.chatbotId,
        conversation.contactId,
        field.customFieldId,
        field.customFieldName,
        field.oldValue,
        field.newValue,
      )
    } catch (error) {
      console.error("Failed to emit customFieldChanged event:", error)
    }
  }
}
