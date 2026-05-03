import {
  aiTimeouts,
  helpTexts,
  processStreamingText,
  toolPrefixes,
} from "@chatbotx.io/ai"
import {
  aiContextService,
  aiIntegrationService,
  createAIModelInstance,
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
import { type ModelMessage, stepCountIs, streamText, type ToolSet } from "ai"
import { logger } from "../../../lib/logger"
import { sendMessageWithRender } from "../../utils/message"

type ReplyByAIProps = {
  conversation: ConversationModel
  messages: ModelMessage[]
  aiAgent: AIAgentModel
  summary?: string
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

  const { tools, cleanup } = await getAIToolset({
    workspaceId: aiAgent.workspaceId,
    tools: aiAgent.tools,
    toolPrefixes: {
      file: toolPrefixes.enum.file,
      fn: toolPrefixes.enum.fn,
      mcp: toolPrefixes.enum.mcp,
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

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), aiTimeouts.aiTotal)

  try {
    for (const providerInfo of providers) {
      const result = await runAIReply(
        props,
        providerInfo,
        tools,
        controller.signal,
      )
      if (result?.responded) {
        return result
      }
    }
  } finally {
    clearTimeout(timeoutId)
    await cleanup()
  }

  return null
}

async function runAIReply(
  props: ReplyByAIProps,
  providerInfo: AIAgentProviderModel,
  tools: ToolSet,
  abortSignal: AbortSignal,
): Promise<null | ReplyByAIExecutionResult> {
  const { conversation, messages, aiAgent } = props
  const provider = providerInfo.provider
  try {
    const selectedModelId = providerInfo.model

    const integration = await aiIntegrationService.findBy({
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

    const variables = await contactVariableService.getAll(
      conversation.contactId,
    )
    const promptBase = aiAgent.prompt
      ? await contactVariableService.replaceAll({
          text: aiAgent.prompt,
          variables,
        })
      : ""
    const completePrompt = props.summary
      ? `Conversation Context: ${props.summary}\n\n${promptBase}`
      : promptBase

    const systemPrompt = appendToolOutputGuard(completePrompt)

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

    const { messageCount, fullText } = await processStreamingText(
      result.textStream,
      async (_segment, parts) => {
        for (const part of parts) {
          await sendMessageWithRender(conversation.id, part)
        }
      },
      { sendParts: true },
    ).catch((streamError) => {
      logger.error(
        {
          provider,
          modelId: selectedModelId,
          conversationId: conversation.id,
          error: streamError,
          errorMessage:
            streamError instanceof Error
              ? streamError.message
              : String(streamError),
        },
        "[automated-response] processStreamingText threw error",
      )
      return { messageCount: 0, fullText: "" }
    })

    if (messageCount > 0 && fullText) {
      await aiContextService.appendHistory({
        conversationId: conversation.id,
        newMessages: [
          {
            message: {
              role: "assistant",
              content: fullText,
            },
            createdAt: Date.now(),
          },
        ],
      })

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
    logger.error(
      {
        error,
        provider,
        conversationId: conversation.id,
        workspaceId: conversation.workspaceId,
      },
      "[automated-response] runAIReply failed",
    )
    return null
  } finally {
    // Parent replyByAI handles global timeout and signal cleanup
  }
}

function appendToolOutputGuard(systemPrompt: string): string {
  return `${systemPrompt}\n\n${helpTexts.toolOutputGuard}`.trim()
}
