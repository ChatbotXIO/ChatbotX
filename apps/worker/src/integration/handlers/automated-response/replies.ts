import {
  aiPolicies,
  aiTimeouts,
  helpTexts,
  processStreamingText,
  systemFunctionNames,
  toolPrefixes,
} from "@chatbotx.io/ai"
import {
  createAIModelInstance,
  getAIIntegrationInDB,
  getAIToolset,
  McpClient,
  normalizeMcpContent,
} from "@chatbotx.io/ai/server"
import type {
  AIAgentProvider,
  AIAgentProviderModel,
  AIAgentProviderModels,
} from "@chatbotx.io/database/partials"
import type {
  AIAgentModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import { contactVariableService } from "@chatbotx.io/variables"
import {
  type LanguageModel,
  type ModelMessage,
  stepCountIs,
  streamText,
  type ToolSet,
} from "ai"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../../lib/logger"
import { handoffExecutorService } from "../../../trigger/services/handoff-executor.service"
import { sendMessageWithRender } from "../../utils/message"
import { createDocumentReaderExecutor } from "./system-tools/document-reader"
import { createImageReaderExecutor } from "./system-tools/image-reader"
import { createUrlReaderExecutor } from "./system-tools/url-reader"

type ReplyByAIProps = {
  conversation: ConversationModel
  messages: ModelMessage[]
  aiAgent: AIAgentModel
  triggerMessageId?: string
  fileOnlyTrigger: boolean
  allowedSystemFunctionIds?: string[]
}

export type ReplyByAIExecutionResult = {
  responded: boolean
  provider: AIAgentProvider
  modelId: string
  usedFallbackText: boolean
  toolStats: {
    steps: number
    toolCallsCount: number
    toolResultsCount: number
    toolErrorsCount: number
    toolNames: string[]
    finishReasons: Array<{
      stepNumber: number
      finishReason: string
      rawFinishReason?: string
    }>
  }
}

export async function replyByAI(
  props: ReplyByAIProps,
): Promise<null | ReplyByAIExecutionResult> {
  const { aiAgent } = props
  const providers = aiAgent.models as AIAgentProviderModels

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), aiTimeouts.aiTotal)

  try {
    for (const providerInfo of providers) {
      const result = await runAIReply(props, providerInfo, controller.signal)
      if (result?.responded) {
        return result
      }
    }
  } finally {
    clearTimeout(timeoutId)
  }

  return null
}

function createReplyToolset(options: {
  abortSignal: AbortSignal
  model: LanguageModel
  modelId: string
  props: ReplyByAIProps
  provider: string
}) {
  const { conversation, aiAgent } = options.props
  const tools = filterToolsByAllowedSystemFunctions(
    aiAgent.tools,
    options.props.allowedSystemFunctionIds,
  )

  return getAIToolset({
    workspaceId: aiAgent.workspaceId,
    tools,
    toolPrefixes: {
      file: toolPrefixes.enum.file,
      fn: toolPrefixes.enum.fn,
      mcp: toolPrefixes.enum.mcp,
      sys: toolPrefixes.enum.sys,
    },
    systemFunctionContextGetter: async () => ({
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
      contactId: conversation.contactId,
    }),
    systemToolExecutors: {
      [systemFunctionNames.connectUserToHuman]: async (args, context) => {
        if (!context) {
          return "I'm ready to connect you to a human agent, but conversation context is missing."
        }

        await handoffExecutorService.execute({
          workspaceId: context.workspaceId,
          conversationId: context.conversationId,
          contactId: context.contactId,
          reason: args.reason,
          source: "ai_system_tool",
          channel: context.channel,
          metadata: {
            userRequestExcerpt: args.userRequestExcerpt,
            requestedBy: args.requestedBy,
          },
        })

        return "I'm connecting you to a human agent who can better assist you. Please stay on the line."
      },
      [systemFunctionNames.documentReader]: createDocumentReaderExecutor({
        fileOnlyTrigger: options.props.fileOnlyTrigger,
        triggerMessageId: options.props.triggerMessageId,
      }),
      [systemFunctionNames.imageReader]: createImageReaderExecutor({
        abortSignal: options.abortSignal,
        fileOnlyTrigger: options.props.fileOnlyTrigger,
        model: options.model,
        modelId: options.modelId,
        provider: options.provider,
        triggerMessageId: options.props.triggerMessageId,
      }),
      [systemFunctionNames.urlContext]: createUrlReaderExecutor({
        fileOnlyTrigger: options.props.fileOnlyTrigger,
        triggerMessageId: options.props.triggerMessageId,
      }),
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
}

function filterToolsByAllowedSystemFunctions(
  tools: string[],
  allowedSystemFunctionIds?: string[],
): string[] {
  if (!allowedSystemFunctionIds) {
    return tools
  }

  const allowedSystemFunctionIdSet = new Set(allowedSystemFunctionIds)
  const systemToolPrefix = `${toolPrefixes.enum.sys}:`

  return tools.filter((tool) => {
    if (!tool.startsWith(systemToolPrefix)) {
      return true
    }

    const systemFunctionId = tool.slice(systemToolPrefix.length)
    return allowedSystemFunctionIdSet.has(systemFunctionId)
  })
}

async function runAIReply(
  props: ReplyByAIProps,
  providerInfo: AIAgentProviderModel,
  abortSignal: AbortSignal,
): Promise<null | ReplyByAIExecutionResult> {
  const { conversation, messages, aiAgent } = props
  const provider = providerInfo.provider
  let cleanup: (() => Promise<void>) | undefined

  try {
    const selectedModelId = providerInfo.model

    const integration = await getAIIntegrationInDB({
      workspaceId: conversation.workspaceId,
      provider,
      autoReply: true,
    })

    if (!integration) {
      return null
    }

    const model = createAIModelInstance({
      model: integration,
      provider,
      modelId: selectedModelId,
      abortSignal,
      traceId: conversation.id,
    })

    const toolset = await createReplyToolset({
      abortSignal,
      model,
      modelId: selectedModelId,
      props,
      provider,
    })
    const tools = toolset.tools
    cleanup = toolset.cleanup

    const variables = await contactVariableService.getAll(
      conversation.contactId,
    )
    const completePrompt = aiAgent.prompt
      ? await contactVariableService.replaceAll({
          text: aiAgent.prompt,
          variables,
        })
      : ""
    const systemPrompt = appendHandoffPolicy(
      appendToolOutputGuard(completePrompt),
      tools,
    )

    const toolNamesSet = new Set<string>()
    const finishReasons: Array<{
      stepNumber: number
      finishReason: string
      rawFinishReason?: string
    }> = []
    let stepCount = 0
    let toolCallsCount = 0
    let toolResultsCount = 0
    let toolErrorsCount = 0

    const result = await streamText({
      model,
      system: systemPrompt,
      messages,
      maxOutputTokens: aiAgent.maxOutputTokens,
      temperature: aiAgent.temperature,
      tools,
      toolChoice: Object.keys(tools).length > 0 ? "auto" : "none",
      stopWhen: stepCountIs(5),
      timeout: {
        totalMs: aiTimeouts.aiTotal,
        stepMs: aiTimeouts.aiStep,
        chunkMs: aiTimeouts.aiChunk,
      },
      onStepFinish: ({
        stepNumber,
        finishReason,
        rawFinishReason,
        toolCalls,
        toolResults,
      }) => {
        stepCount = Math.max(stepCount, stepNumber + 1)
        finishReasons.push({
          stepNumber,
          finishReason,
          rawFinishReason,
        })

        toolCallsCount += toolCalls.length
        for (const call of toolCalls) {
          if (call?.toolName) {
            toolNamesSet.add(call.toolName)
          }
        }

        toolResultsCount += toolResults.length
        for (const tr of toolResults as unknown as Array<{
          isError?: boolean
        }>) {
          if (tr?.isError) {
            toolErrorsCount += 1
          }
        }
      },
      experimental_onToolCallFinish: ({
        toolCall,
        durationMs,
        success,
        error,
      }) => {
        if (!success) {
          logger.warn(
            {
              provider,
              modelId: selectedModelId,
              conversationId: conversation.id,
              workspaceId: conversation.workspaceId,
              toolName: toolCall?.toolName,
              toolCallId: toolCall?.toolCallId,
              durationMs,
              error,
              errorMessage:
                error instanceof Error ? error.message : String(error),
              errorCause: error instanceof Error ? error.cause : undefined,
              errorStack: error instanceof Error ? error.stack : undefined,
            },
            "[automated-response] tool execution failed",
          )
        }
      },
      abortSignal,
    })

    const { messageCount } = await processStreamingText(
      result.textStream,
      async (_segment, parts) => {
        for (const part of parts) {
          await sendMessageWithRender(conversation.id, part)
        }
      },
      { sendParts: true },
    ).catch((streamError) => {
      const normalizedError = normalizeError(streamError)
      logger.error(
        {
          provider,
          modelId: selectedModelId,
          conversationId: conversation.id,
          error: normalizedError,
        },
        "[automated-response] processStreamingText threw error",
      )
      return { messageCount: 0 }
    })

    if (messageCount > 0) {
      return {
        responded: true,
        provider: provider as AIAgentProvider,
        modelId: selectedModelId,
        usedFallbackText: false,
        toolStats: {
          steps: stepCount,
          toolCallsCount,
          toolResultsCount,
          toolErrorsCount,
          toolNames: Array.from(toolNamesSet).slice(0, 10),
          finishReasons: finishReasons.slice(0, 10),
        },
      }
    }

    // Last-resort fallback: loop finished but no assistant text was produced.
    // Do NOT leak raw tool outputs; ask a clarifying question instead.
    if (toolCallsCount > 0 || toolResultsCount > 0) {
      await sendMessageWithRender(conversation.id, helpTexts.fallbackLookup)
      return {
        responded: true,
        provider: provider as AIAgentProvider,
        modelId: selectedModelId,
        usedFallbackText: true,
        toolStats: {
          steps: stepCount,
          toolCallsCount,
          toolResultsCount,
          toolErrorsCount,
          toolNames: Array.from(toolNamesSet).slice(0, 10),
          finishReasons: finishReasons.slice(0, 10),
        },
      }
    }

    return null
  } catch (error) {
    const normalizedError = normalizeError(error)
    logger.error(
      {
        error: normalizedError,
        provider,
        conversationId: conversation.id,
        workspaceId: conversation.workspaceId,
      },
      "[automated-response] runAIReply failed",
    )
    return null
  } finally {
    try {
      await cleanup?.()
    } catch (cleanupError) {
      const normalizedError = normalizeError(cleanupError)
      logger.error(
        {
          error: normalizedError,
          provider,
          conversationId: conversation.id,
          workspaceId: conversation.workspaceId,
        },
        "[automated-response] tool cleanup failed",
      )
    }
  }
}

function appendToolOutputGuard(systemPrompt: string): string {
  return `${systemPrompt}\n\n${helpTexts.toolOutputGuard}`.trim()
}

function appendHandoffPolicy(systemPrompt: string, tools: ToolSet): string {
  if (!tools[systemFunctionNames.connectUserToHuman]) {
    return systemPrompt
  }

  return `${systemPrompt}\n\n${aiPolicies.handoff}`.trim()
}
