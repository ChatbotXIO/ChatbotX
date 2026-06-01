import { helpTexts, processStreamingText, toolPrefixes } from "@chatbotx.io/ai"
import {
  createAIModelInstance,
  getAIIntegrationInDB,
  getAIToolset,
  McpClient,
  normalizeMcpContent,
} from "@chatbotx.io/ai/server"
import { db, findOrFail } from "@chatbotx.io/database/client"
import {
  contactCustomFieldModel,
  contactModel,
  customFieldModel,
} from "@chatbotx.io/database/schema"
import type { AIGenerateTextSchema } from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import { streamText } from "ai"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../../lib/logger"
import { sendMessageWithRender } from "../../utils/message"
import type { ExecuteStepProps } from "../flow-utils"
import type { ExecuteStepResult } from "../step"
import { buildAIMessages } from "./messages"

export async function handleAIGenerateText(
  props: ExecuteStepProps<AIGenerateTextSchema>,
): Promise<ExecuteStepResult> {
  const { conversation, step } = props
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 120_000)

  let cleanupToolset: (() => Promise<void>) | undefined

  try {
    const messages = await buildAIMessages(conversation, step)

    const aiConfig = await getAIIntegrationInDB({
      workspaceId: conversation.workspaceId,
      provider: step.provider,
    })

    if (!aiConfig) {
      return {
        status: "error",
        errorMessage: "AI integration not found",
        result: null,
      }
    }

    const model = createAIModelInstance({
      model: aiConfig,
      provider: step.provider,
      modelId: step.model,
      abortSignal: controller.signal,
      traceId: conversation.id,
    })

    const { tools, cleanup } = await getAIToolset({
      workspaceId: conversation.workspaceId,
      tools: step.tools || [],
      toolPrefixes: {
        file: toolPrefixes.enum.file,
        fn: toolPrefixes.enum.fn,
        mcp: toolPrefixes.enum.mcp,
        sys: toolPrefixes.enum.sys,
      },
      fileSearch: {
        fileSearchDescription: helpTexts.fileSearchDescription,
        fileSearchQueryDescription: helpTexts.fileSearchQueryDescription,
        fileSearchNoResult: helpTexts.fileSearchNoResult,
        fileSearchFoundPrefix: helpTexts.fileSearchFoundPrefix,
      },
      mcp: {
        McpClient,
        normalizeMcpContent,
      },
    })
    cleanupToolset = cleanup

    const result = streamText({
      model,
      system: step.system,
      messages,
      tools,
      toolChoice: Object.keys(tools).length > 0 ? "auto" : undefined,
      maxOutputTokens: step.maxOutputTokens,
      temperature: step.temperature,
      onError: (error) => {
        throw error.error
      },
    })

    const { fullText } = await processStreamingText(
      result.textStream,
      async (_segment, parts) => {
        for (const part of parts) {
          await sendMessageWithRender(conversation.id, part)
        }
      },
      { sendParts: true },
    )

    await saveResultToCustomField({
      contactId: conversation.contactId,
      customFieldId: step.outputFieldId,
      text: fullText,
    })

    return { status: "success", result: null }
  } catch (err) {
    const error = normalizeError(err)
    logger.error(error, "An error occurred while generating text")
    return { status: "error", errorMessage: error.message, result: null }
  } finally {
    clearTimeout(timeoutId)
    if (cleanupToolset) {
      await cleanupToolset()
    }
  }
}

export async function saveResultToCustomField(props: {
  contactId: string
  customFieldId: string
  text: string
}): Promise<void> {
  const { contactId, customFieldId, text } = props

  const contact = await findOrFail({
    table: contactModel,
    where: {
      id: contactId,
    },
    message: "Contact not found",
  })

  const customField = await findOrFail({
    table: customFieldModel,
    where: {
      id: customFieldId,
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
