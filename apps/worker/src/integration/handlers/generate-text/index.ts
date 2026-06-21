import { helpTexts, processStreamingText, toolPrefixes } from "@chatbotx.io/ai"
import {
  aiIntegrationService,
  createAIModelInstance,
  getAIToolset,
  McpClient,
  normalizeMcpContent,
} from "@chatbotx.io/ai/server"
import { isMessageStorageError } from "@chatbotx.io/database/errors"
import type { AIGenerateTextSchema } from "@chatbotx.io/flow-config"
import { APICallError, streamText } from "ai"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../../lib/logger"
import { saveResultToCustomField } from "../../utils/contact"
import type { ExecuteStepProps } from "../flow-utils"
import type { ExecuteStepResult } from "../step"
import { buildAIMessages } from "./messages"

const ERROR_INSUFFICIENT_CREDITS =
  "AI provider has insufficient credits. Please check your billing settings."

export async function handleAIGenerateText({
  conversation,
  contactInbox,
  step,
}: ExecuteStepProps<AIGenerateTextSchema>): Promise<ExecuteStepResult> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 120_000)

  let cleanupToolset: (() => Promise<void>) | undefined

  try {
    const messages = await buildAIMessages(conversation, contactInbox, step)

    const aiConfig = await aiIntegrationService.findBy({
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
      abortSignal: controller.signal,
      onError: (error) => {
        throw error.error
      },
    })

    const { fullText } = await processStreamingText(
      result.textStream,
      async () => {
        // noop: fullText is accumulated internally, no message to send
      },
      { sendParts: false },
    )

    await saveResultToCustomField({
      contactId: conversation.contactId,
      customFieldId: step.outputFieldId,
      fullText,
      workspaceId: conversation.workspaceId,
    })

    return { status: "success", result: null }
  } catch (err) {
    if (isMessageStorageError(err)) {
      throw err
    }
    if (APICallError.isInstance(err) && err.statusCode === 402) {
      logger.error({ err }, "AI provider insufficient credits")
      return {
        status: "error",
        errorMessage: ERROR_INSUFFICIENT_CREDITS,
        result: null,
      }
    }
    const error = normalizeError(err)
    logger.error({ err: error }, "An error occurred while generating text")
    return { status: "error", errorMessage: error.message, result: null }
  } finally {
    clearTimeout(timeoutId)
    if (cleanupToolset) {
      await cleanupToolset()
    }
  }
}
