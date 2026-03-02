import { db, eq } from "@aha.chat/database/client"
import {
  contactCustomFieldModel,
  contactModel,
} from "@aha.chat/database/schema"
import {
  AIMessageRole,
  type ConversationModel,
  type Gender,
  reservedCustomFieldNames,
} from "@aha.chat/database/types"
import type { AIGenerateTextSchema } from "@aha.chat/flow-config"
import { createId } from "@paralleldrive/cuid2"
import { type LanguageModel, type ModelMessage, streamText } from "ai"
import { getAIIntegrationInDB, getAIModel } from "../../../lib/ai"
import { logger } from "../../../lib/logger"
import {
  MAGIC_NUMBERS,
  TEXT,
  TOOL_RESULT_PREFIX,
  TOOL_RESULT_SUFFIX,
} from "../automated-response/constants"
import { processStreamingText } from "../automated-response/text"
import type { ExecuteStepProps } from "../flow"
import { buildAIMessages } from "./messages"
import { getAIToolset } from "./tools"

type StreamTextResult = Awaited<ReturnType<typeof streamText>>
type ToolResults = Awaited<StreamTextResult["toolResults"]>

export async function handleAIGenerateText({
  conversation,
  step,
}: ExecuteStepProps<AIGenerateTextSchema>) {
  try {
    const messages = await buildAIMessages(conversation, step)

    const aiConfig = await getAIIntegrationInDB({
      chatbotId: conversation.chatbotId,
      provider: step.provider,
    })

    const model = getAIModel(aiConfig, aiConfig.model)

    const toolSet = await getAIToolset(conversation.chatbotId, step.tools || [])

    const result = streamText({
      model: "openai:gpt-4o-mini",
      system: step.system,
      messages,
      tools: toolSet,
      toolChoice: Object.keys(toolSet).length > 0 ? "auto" : undefined,
      maxOutputTokens: step.maxOutputTokens,
      temperature: step.temperature,
    })

    const toolCalls = await result.toolCalls
    const toolResults = await result.toolResults

    const { messageCount, fullText } = await processStreamingText(
      result.textStream,
      conversation.id,
      { sendParts: true },
    )

    if (toolCalls && toolCalls.length > 0) {
      await handleToolCallsFollowUp({
        model: model(step.model),
        messages,
        toolResults,
        fullText,
        stepConfig: step,
        conversation,
        finalMaxOutputTokens: step.maxOutputTokens,
        temperature: step.temperature,
      })
    } else {
      await saveResultToCustomField({
        contactId: conversation.contactId,
        customFieldId: step.outputCfId,
        fullText,
        messageCount,
        chatbotId: conversation.chatbotId,
      })
    }
  } catch (error) {
    logger.error(
      {
        error,
        conversationId: conversation.id,
        stepId: step.id,
        stepType: step.stepType,
      },
      "[ai-generate-text] Step failed",
    )
    throw error
  }
}

async function handleToolCallsFollowUp({
  model,
  messages,
  toolResults,
  fullText,
  stepConfig,
  conversation,
  finalMaxOutputTokens,
  temperature,
}: {
  model: LanguageModel
  messages: Awaited<ReturnType<typeof buildAIMessages>>
  toolResults: ToolResults
  fullText: string
  stepConfig: AIGenerateTextSchema
  conversation: ConversationModel
  finalMaxOutputTokens: number
  temperature: number
}): Promise<void> {
  const toolResultsText = toolResults
    .map(
      (r) =>
        `${TOOL_RESULT_PREFIX}${r.toolName}${TOOL_RESULT_SUFFIX}${r.output}`,
    )
    .join("\n\n")

  const followUpMessages: ModelMessage[] = [
    ...messages,
    {
      role: AIMessageRole.assistant,
      content: fullText || TEXT.assistantFoundPrefix,
    },
    {
      role: AIMessageRole.user,
      content: `${TEXT.followUpInstruction}\n\n${toolResultsText}`,
    },
  ]

  try {
    const followUpResult = await streamText({
      model,
      system: stepConfig.system,
      messages: followUpMessages,
      maxOutputTokens: finalMaxOutputTokens,
      temperature,
    })

    const { messageCount: followUpMessageCount, fullText: followUpFullText } =
      await processStreamingText(followUpResult.textStream, conversation.id, {
        sendParts: true,
      })

    await saveResultToCustomField({
      contactId: conversation.contactId,
      customFieldId: stepConfig.outputCfId,
      fullText: followUpFullText,
      messageCount: followUpMessageCount,
      chatbotId: conversation.chatbotId,
    })
  } catch (followUpError) {
    logger.error(
      {
        error: followUpError,
        conversationId: conversation.id,
        stepId: stepConfig.id,
      },
      "[ai-generate-text] Follow-up request failed",
    )

    await saveResultToCustomField({
      contactId: conversation.contactId,
      customFieldId: stepConfig.outputCfId,
      fullText,
      messageCount: MAGIC_NUMBERS.ZERO_MESSAGE_COUNT,
      chatbotId: conversation.chatbotId,
    })
  }
}

async function saveResultToCustomField({
  contactId,
  customFieldId,
  fullText,
  messageCount,
  chatbotId,
}: {
  contactId: string | null
  customFieldId: string
  fullText: string
  messageCount: number
  chatbotId: string
}): Promise<void> {
  if (!contactId) {
    return
  }
  if (!customFieldId.trim()) {
    return
  }
  if (messageCount === 0) {
    return
  }
  if (!fullText) {
    return
  }

  const isReservedField = Object.values(reservedCustomFieldNames).includes(
    customFieldId as (typeof reservedCustomFieldNames)[keyof typeof reservedCustomFieldNames],
  )

  if (isReservedField) {
    const updateData: Partial<{
      firstName: string
      lastName: string
      email: string
      phoneNumber: string
      avatar: string
      gender: Gender
    }> = {}

    switch (customFieldId) {
      case reservedCustomFieldNames.first_name:
        updateData.firstName = fullText
        break
      case reservedCustomFieldNames.last_name:
        updateData.lastName = fullText
        break
      case reservedCustomFieldNames.full_name: {
        const trimmedName = fullText.trim()
        const spaceIndex = trimmedName.indexOf(" ")
        if (spaceIndex > 0) {
          updateData.firstName = trimmedName.substring(0, spaceIndex)
          updateData.lastName = trimmedName.substring(spaceIndex + 1).trim()
        } else if (trimmedName.length > 0) {
          updateData.firstName = trimmedName
        }
        break
      }
      case reservedCustomFieldNames.email:
        updateData.email = fullText
        break
      case reservedCustomFieldNames.phone_number:
        updateData.phoneNumber = fullText
        break
      case reservedCustomFieldNames.avatar:
        updateData.avatar = fullText
        break
      case reservedCustomFieldNames.gender:
        if (
          fullText === "male" ||
          fullText === "female" ||
          fullText === "unknown"
        ) {
          updateData.gender = fullText as Gender
        }
        break
      default:
        return
    }

    await db
      .update(contactModel)
      .set(updateData)
      .where(eq(contactModel.id, contactId))
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
      contactId,
      customFieldId,
      value: fullText,
      id: createId(),
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
