import { db, eq } from "@chatbotx.io/database/client"
import {
  aiMessageRoles,
  type GenderType,
  type ReservedCustomFieldName,
  reservedCustomFieldNames,
} from "@chatbotx.io/database/partials"
import {
  contactCustomFieldModel,
  contactModel,
} from "@chatbotx.io/database/schema"
import type { ConversationModel } from "@chatbotx.io/database/types"
import type { AIGenerateTextSchema } from "@chatbotx.io/flow-config"
import { createId, parseBigIntId } from "@chatbotx.io/utils"
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
      workspaceId: conversation.workspaceId,
      provider: step.provider,
    })

    const model = getAIModel(aiConfig, aiConfig.model)

    const toolSet = await getAIToolset(
      conversation.workspaceId,
      step.tools || [],
    )

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
        customFieldName: step.outputCfId,
        fullText,
        messageCount,
        workspaceId: conversation.workspaceId,
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
      role: aiMessageRoles.enum.assistant,
      content: fullText || TEXT.assistantFoundPrefix,
    },
    {
      role: aiMessageRoles.enum.user,
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
      customFieldName: stepConfig.outputCfId,
      fullText: followUpFullText,
      messageCount: followUpMessageCount,
      workspaceId: conversation.workspaceId,
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
      customFieldName: stepConfig.outputCfId,
      fullText,
      messageCount: MAGIC_NUMBERS.ZERO_MESSAGE_COUNT,
      workspaceId: conversation.workspaceId,
    })
  }
}

async function saveResultToCustomField({
  contactId,
  customFieldName,
  fullText,
  messageCount,
  workspaceId,
}: {
  contactId: string | null
  customFieldName: string
  fullText: string
  messageCount: number
  workspaceId: string
}): Promise<void> {
  if (!contactId) {
    return
  }
  if (!customFieldName) {
    return
  }
  if (messageCount === 0) {
    return
  }
  if (!fullText) {
    return
  }

  const isReservedField = Object.values(reservedCustomFieldNames).includes(
    customFieldName as ReservedCustomFieldName,
  )

  if (isReservedField) {
    const updateData: Partial<{
      firstName: string
      lastName: string
      email: string
      phoneNumber: string
      avatar: string
      gender: GenderType
    }> = {}

    switch (customFieldName) {
      case reservedCustomFieldNames.enum.first_name:
        updateData.firstName = fullText
        break
      case reservedCustomFieldNames.enum.last_name:
        updateData.lastName = fullText
        break
      case reservedCustomFieldNames.enum.full_name: {
        const trimmedName = fullText.trim()
        const spaceIndex = trimmedName.indexOf(" ")
        if (spaceIndex > 0) {
          updateData.firstName = trimmedName.slice(0, spaceIndex)
          updateData.lastName = trimmedName.slice(spaceIndex + 1).trim()
        } else if (trimmedName.length > 0) {
          updateData.firstName = trimmedName
        }
        break
      }
      case reservedCustomFieldNames.enum.email:
        updateData.email = fullText
        break
      case reservedCustomFieldNames.enum.phone_number:
        updateData.phoneNumber = fullText
        break
      case reservedCustomFieldNames.enum.avatar:
        updateData.avatar = fullText
        break
      case reservedCustomFieldNames.enum.gender:
        if (
          fullText === "male" ||
          fullText === "female" ||
          fullText === "unknown"
        ) {
          updateData.gender = fullText as GenderType
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

  const customFieldId = parseBigIntId(customFieldName)
  if (!customFieldId) {
    return
  }
  const customField = await db.query.customFieldModel.findFirst({
    where: {
      id: customFieldId,
      workspaceId,
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
