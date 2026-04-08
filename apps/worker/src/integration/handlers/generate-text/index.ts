import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import {
  type CustomFieldType,
  customFieldTypes,
  type SystemFieldType,
  systemFieldTypes,
} from "@chatbotx.io/database/partials"
import {
  contactCustomFieldModel,
  contactModel,
  customFieldModel,
} from "@chatbotx.io/database/schema"
import type { AIGenerateTextSchema } from "@chatbotx.io/flow-config"
import { createId, parseBigIntId } from "@chatbotx.io/utils"
import { streamText } from "ai"
import { normalizeError } from "universal-error-normalizer"
import { createAIModelInstance, getAIIntegrationInDB } from "../../../lib/ai"
import { logger } from "../../../lib/logger"
import { processStreamingText } from "../automated-response/text"
import type { ExecuteStepProps } from "../flow"
import { buildAIMessages } from "./messages"
import { getAIToolset } from "./tools"

export async function handleAIGenerateText({
  conversation,
  step,
}: ExecuteStepProps<AIGenerateTextSchema>) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 120_000)

  try {
    const messages = await buildAIMessages(conversation, step)

    const aiConfig = await getAIIntegrationInDB({
      workspaceId: conversation.workspaceId,
      provider: step.provider,
    })

    if (!aiConfig) {
      return
    }

    const model = createAIModelInstance({
      model: aiConfig,
      provider: step.provider,
      modelId: step.model,
      abortSignal: controller.signal,
      traceId: conversation.id,
    })

    const toolSet = await getAIToolset(
      conversation.workspaceId,
      step.tools || [],
    )

    const result = streamText({
      model,
      system: step.system,
      messages,
      tools: toolSet,
      toolChoice: Object.keys(toolSet).length > 0 ? "auto" : undefined,
      maxOutputTokens: step.maxOutputTokens,
      temperature: step.temperature,
      onError: (error) => {
        throw error.error
      },
    })

    const { fullText } = await processStreamingText(
      result.textStream,
      conversation.id,
      { sendParts: true },
    )

    await saveResultToCustomField({
      contactId: conversation.contactId,
      customFieldId: step.outputFieldId,
      text: fullText,
      abortSignal: controller.signal,
    })
  } catch (error) {
    const parsedError = normalizeError(error)
    logger.error(parsedError, "[ai-generate-text] Step failed")
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

// async function validateExtractedData(
//   data: ContactSchemaOutput,
// ): Promise<ContactData> {
//   const validated: ContactData = {}

//   if (data.email?.includes("@")) {
//     validated.email = data.email
//   }

//   if (
//     data.firstName &&
//     data.firstName.length >= 2 &&
//     !REGEX_ONLY_NUMBERS.test(data.firstName)
//   ) {
//     validated.firstName = data.firstName
//   }

//   if (data.lastName) {
//     validated.lastName = data.lastName
//   }

//   if (data.fullName) {
//     validated.fullName = data.fullName
//   }

//   if (data.phoneNumber) {
//     validated.phoneNumber = data.phoneNumber
//   }

//   if (data.gender) {
//     validated.gender = data.gender as GenderType
//   }

//   return await Promise.resolve(validated)
// }

function validateValue(fieldType: CustomFieldType, value: string) {
  switch (fieldType) {
    case customFieldTypes.enum.shortText: {
      return value
    }
    case customFieldTypes.enum.longText: {
      return value
    }
    case customFieldTypes.enum.number: {
      return value
    }
    case customFieldTypes.enum.date: {
      return value
    }
    case customFieldTypes.enum.datetime: {
      return value
    }
    case customFieldTypes.enum.boolean: {
      return value
    }
    default: {
      return value
    }
  }
}

async function saveResultToCustomField(props: {
  contactId: string
  customFieldId: string
  text: string
  abortSignal: AbortSignal
}): Promise<void> {
  const { contactId, customFieldId, text } = props
  const contact = await findOrFail({
    table: contactModel,
    where: {
      id: contactId,
    },
    message: "Contact not found",
  })

  // const { output: extractedDataRaw } = await generateText({
  //   model,
  //   output: Output.object({ schema: contactSchema }),
  //   prompt: AI_GENERATE_TEXT.RESERVED_FIELD_EXTRACTION_PROMPT.replace(
  //     "{{customFieldId}}",
  //     customFieldId,
  //   ).replace("{{fullText}}", fullText),
  //   temperature: 0,
  //   abortSignal,
  // })

  const isSystemField = systemFieldTypes.options.includes(
    customFieldId as SystemFieldType,
  )
  if (isSystemField) {
    const updateContactData: Partial<typeof contactModel.$inferInsert> = {}

    switch (customFieldId) {
      case systemFieldTypes.enum.firstName: {
        updateContactData.firstName = validateValue(
          customFieldTypes.enum.shortText,
          text,
        )
        break
      }
      case systemFieldTypes.enum.lastName: {
        updateContactData.lastName = validateValue(
          customFieldTypes.enum.shortText,
          text,
        )
        break
      }
      case systemFieldTypes.enum.email: {
        updateContactData.email = validateValue(
          customFieldTypes.enum.email,
          text,
        )
        break
      }
      case systemFieldTypes.enum.phoneNumber: {
        updateContactData.phoneNumber = validateValue(
          customFieldTypes.enum.phoneNumber,
          text,
        )
        break
      }
      default: {
        break
      }
    }

    if (Object.keys(updateContactData).length > 0) {
      await db
        .update(contactModel)
        .set(updateContactData)
        .where(eq(contactModel.id, contactId))
    }
    return
  }

  const customFieldIdInt = parseBigIntId(customFieldId)
  if (!customFieldIdInt) {
    return
  }

  const customField = await findOrFail({
    table: customFieldModel,
    where: {
      id: customFieldIdInt,
      workspaceId: contact.workspaceId,
    },
    message: "Custom field not found",
  })

  await db
    .insert(contactCustomFieldModel)
    .values({
      contactId,
      customFieldId: customField.id,
      value: text,
      id: createId(),
    })
    .onConflictDoUpdate({
      target: [
        contactCustomFieldModel.contactId,
        contactCustomFieldModel.customFieldId,
      ],
      set: {
        value: text,
      },
    })
}
