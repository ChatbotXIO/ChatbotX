import { prisma } from "@aha.chat/database"
import { FieldType } from "@aha.chat/database/types"
import {
  type CountCharactersStepSchema,
  type FormatDateStepSchema,
  type GenerateCodeStepSchema,
  GenerateCodeType,
  type GetDataFromJsonStepSchema,
} from "@aha.chat/flow-config"
import { faker } from "@faker-js/faker"
import { format } from "date-fns"
import { getProperty } from "dot-prop"
import type { FlowStepProps } from "./step-handler"

export async function countCharacters({
  conversation,
  step,
}: FlowStepProps<CountCharactersStepSchema>) {
  const customFieldIds = [step.inputCustomFieldId, step.outputCustomFieldId]
  const customFieldsCount = await prisma.field.count({
    where: {
      fieldType: FieldType.customField,
      id: {
        in: customFieldIds,
      },
    },
  })
  if (customFieldsCount !== 2) {
    return
  }

  // Find target contact custom field
  const targetContactCustomField = await prisma.contactCustomField.findFirst({
    where: {
      customFieldId: step.inputCustomFieldId,
    },
  })
  if (!targetContactCustomField) {
    return
  }

  const value = `${`${targetContactCustomField.value}`.length}`

  await prisma.contactCustomField.upsert({
    where: {
      contactId_customFieldId: {
        contactId: conversation.contactId,
        customFieldId: step.outputCustomFieldId,
      },
    },
    update: {
      value,
    },
    create: {
      value,
      contactId: conversation.contactId,
      customFieldId: step.outputCustomFieldId,
    },
  })
}

export async function formatDate({
  conversation,
  step,
}: FlowStepProps<FormatDateStepSchema>) {
  const inputContactCustomField = await prisma.contactCustomField.findFirst({
    where: {
      customFieldId: step.inputCustomFieldId,
      contactId: conversation.contactId,
    },
  })
  if (!inputContactCustomField) {
    return
  }

  const newValue = format(new Date(inputContactCustomField.value), step.format)

  await prisma.contactCustomField.upsert({
    where: {
      contactId_customFieldId: {
        contactId: conversation.contactId,
        customFieldId: step.outputCustomFieldId,
      },
    },
    update: {
      value: newValue,
    },
    create: {
      contactId: conversation.contactId,
      customFieldId: step.outputCustomFieldId,
      value: newValue,
    },
  })
}

export async function generateCode({
  conversation,
  step,
}: FlowStepProps<GenerateCodeStepSchema>) {
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
    await prisma.contactCustomField.upsert({
      where: {
        contactId_customFieldId: {
          contactId: conversation.contactId,
          customFieldId: step.outputCustomFieldId,
        },
      },
      update: {
        value,
      },
      create: {
        contactId: conversation.contactId,
        customFieldId: step.outputCustomFieldId,
        value,
      },
    })
  }
}

export async function getDataFromJSON({
  conversation,
  step,
}: FlowStepProps<GetDataFromJsonStepSchema>) {
  const inputValue = await prisma.contactCustomField.findFirst({
    where: {
      contactId: conversation.contactId,
      customFieldId: step.inputCustomFieldId,
    },
  })
  if (!inputValue) {
    return
  }

  const dataJSON = JSON.parse(inputValue.value)
  const mapping = step.mapping as {
    jsonPath: string
    outputCustomFieldId: string
  }[]

  // Find valid custom fields
  const validCustomFields = await prisma.field.findMany({
    where: {
      fieldType: FieldType.customField,
      chatbotId: conversation.chatbotId,
      id: {
        in: mapping.map((m) => m.outputCustomFieldId),
      },
    },
    select: {
      id: true,
    },
  })
  const validCustomFieldIds = validCustomFields.map((v) => v.id)

  await prisma.$transaction(async (tx) => {
    for (const data of mapping) {
      if (validCustomFieldIds.includes(data.outputCustomFieldId)) {
        const value = getProperty(dataJSON, data.jsonPath)

        if (value) {
          const encodedValue = JSON.stringify(value)
          await tx.contactCustomField.upsert({
            where: {
              contactId_customFieldId: {
                contactId: conversation.contactId,
                customFieldId: data.outputCustomFieldId,
              },
            },
            update: {
              value: encodedValue,
            },
            create: {
              contactId: conversation.contactId,
              customFieldId: data.outputCustomFieldId,
              value: encodedValue,
            },
          })
        }
      }
    }
  })
}
