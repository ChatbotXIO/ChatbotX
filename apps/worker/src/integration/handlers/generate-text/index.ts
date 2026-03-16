import { db, eq } from "@aha.chat/database/client"
import {
  contactCustomFieldModel,
  contactModel,
} from "@aha.chat/database/schema"
import { type Gender, reservedCustomFieldNames } from "@aha.chat/database/types"
import type { AIGenerateTextSchema } from "@aha.chat/flow-config"
import { createId } from "@paralleldrive/cuid2"
import type { LanguageModel } from "ai"
import { generateText, Output, streamText } from "ai"
import { z } from "zod"
import { createAIModelInstance, getAIIntegrationInDB } from "../../../lib/ai"
import { logger } from "../../../lib/logger"
import { AI_GENERATE_TEXT } from "../automated-response/constants"
import { processStreamingText } from "../automated-response/text"
import type { ExecuteStepProps } from "../flow"
import { buildAIMessages } from "./messages"
import { getAIToolset } from "./tools"

export const contactSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  fullName: z.string(),
  email: z.string(),
  phoneNumber: z.string(),
  gender: z.enum(["male", "female", "unknown"]),
})

export type ContactSchemaOutput = z.infer<typeof contactSchema>

export type ContactData = {
  firstName?: string
  lastName?: string
  fullName?: string
  email?: string
  phoneNumber?: string
  gender?: Gender
}

export async function handleAIGenerateText({
  conversation,
  step,
}: ExecuteStepProps<AIGenerateTextSchema>) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 120_000)

  try {
    const messages = await buildAIMessages(conversation, step)

    const aiConfig = await getAIIntegrationInDB({
      chatbotId: conversation.chatbotId,
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

    const toolSet = await getAIToolset(conversation.chatbotId, step.tools || [])

    const result = streamText({
      model,
      system: step.system,
      messages,
      tools: toolSet,
      toolChoice: Object.keys(toolSet).length > 0 ? "auto" : undefined,
      maxOutputTokens: step.maxOutputTokens,
      temperature: step.temperature,
      // @ts-expect-error - maxSteps is supported in AI SDK v6
      maxSteps: 5,
      abortSignal: controller.signal,
    })

    const { messageCount, fullText } = await processStreamingText(
      result.textStream,
      conversation,
      { sendParts: true },
    )

    await saveResultToCustomField({
      contactId: conversation.contactId,
      customFieldId: step.outputCfId,
      fullText,
      messageCount,
      chatbotId: conversation.chatbotId,
      model,
      abortSignal: controller.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      logger.warn(
        {
          conversationId: conversation.id,
          stepId: step.id,
        },
        "[ai-generate-text] Step timed out or aborted",
      )
    } else {
      logger.error(
        {
          error,
          conversationId: conversation.id,
          stepId: step.id,
          stepType: step.stepType,
        },
        "[ai-generate-text] Step failed",
      )
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

const REGEX_ONLY_NUMBERS = /^\d+$/

export async function validateExtractedData(
  data: ContactSchemaOutput,
): Promise<ContactData> {
  const validated: ContactData = {}

  if (data.email?.includes("@")) {
    validated.email = data.email
  }

  if (
    data.firstName &&
    data.firstName.length >= 2 &&
    !REGEX_ONLY_NUMBERS.test(data.firstName)
  ) {
    validated.firstName = data.firstName
  }

  if (data.lastName) {
    validated.lastName = data.lastName
  }

  if (data.fullName) {
    validated.fullName = data.fullName
  }

  if (data.phoneNumber) {
    validated.phoneNumber = data.phoneNumber
  }

  if (data.gender) {
    validated.gender = data.gender as Gender
  }

  return await Promise.resolve(validated)
}

export async function saveResultToCustomField({
  contactId,
  customFieldId,
  fullText,
  messageCount,
  chatbotId,
  model,
  abortSignal,
}: {
  contactId: string | null
  customFieldId: string
  fullText: string
  messageCount: number
  chatbotId: string
  model: LanguageModel
  abortSignal: AbortSignal
}): Promise<void> {
  if (!(contactId && customFieldId.trim()) || messageCount === 0 || !fullText) {
    return
  }

  const isReservedField = Object.values(reservedCustomFieldNames).includes(
    customFieldId as (typeof reservedCustomFieldNames)[keyof typeof reservedCustomFieldNames],
  )

  if (isReservedField) {
    const { output: extractedDataRaw } = await generateText({
      model,
      output: Output.object({ schema: contactSchema }),
      prompt: AI_GENERATE_TEXT.RESERVED_FIELD_EXTRACTION_PROMPT.replace(
        "{{customFieldId}}",
        customFieldId,
      ).replace("{{fullText}}", fullText),
      temperature: 0,
      abortSignal,
    })

    const extractedData = await validateExtractedData(extractedDataRaw)

    const updateData: Partial<{
      firstName: string
      lastName: string
      email: string
      phoneNumber: string
      avatar: string
      gender: Gender
    }> = {}

    switch (customFieldId) {
      case reservedCustomFieldNames.first_name: {
        if (extractedData.firstName) {
          updateData.firstName = extractedData.firstName
        }
        break
      }
      case reservedCustomFieldNames.last_name: {
        if (extractedData.lastName) {
          updateData.lastName = extractedData.lastName
        }
        break
      }
      case reservedCustomFieldNames.full_name: {
        if (extractedData.firstName) {
          updateData.firstName = extractedData.firstName
        }
        if (extractedData.lastName) {
          updateData.lastName = extractedData.lastName
        }
        break
      }
      case reservedCustomFieldNames.email: {
        if (extractedData.email) {
          updateData.email = extractedData.email
        }
        break
      }
      case reservedCustomFieldNames.phone_number: {
        if (extractedData.phoneNumber) {
          updateData.phoneNumber = extractedData.phoneNumber
        }
        break
      }
      case reservedCustomFieldNames.gender: {
        if (extractedData.gender) {
          updateData.gender = extractedData.gender as Gender
        }
        break
      }
      default:
        return
    }

    if (Object.keys(updateData).length > 0) {
      await db
        .update(contactModel)
        .set(updateData)
        .where(eq(contactModel.id, contactId))
    }
    return
  }

  const customField = await db.query.fieldModel.findFirst({
    where: {
      id: customFieldId,
      fieldType: "customField",
      chatbotId,
    },
  })

  if (!customField) {
    return
  }

  await db
    .insert(contactCustomFieldModel)
    .values({
      id: createId(),
      contactId,
      customFieldId,
      value: fullText,
    })
    .onConflictDoUpdate({
      target: [
        contactCustomFieldModel.contactId,
        contactCustomFieldModel.customFieldId,
      ],
      set: {
        value: fullText,
      },
    })
}
