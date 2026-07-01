import {
  aiProviders,
  aiTimeouts,
  helpTexts,
  processStreamingText,
  systemFunctionNames,
  toolPrefixes,
} from "@chatbotx.io/ai"
import {
  type AIProviderInstance,
  aiContextService,
  appendFabricationGuard,
  appendHandoffPolicy,
  appendKnowledgeBaseGuard,
  appendToolOutputGuard,
  createAIProviderInstance,
  getAIIntegrationInDB,
  getAIToolset,
  McpClient,
  normalizeAuthorizedWebSearchDomains,
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
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
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
import { sendMessageAndWait, sendMessageWithRender } from "../../utils/message"
import { handleRichAIReply } from "./rich-reply"
import { createDocumentReaderExecutor } from "./system-tools/document-reader"
import { createImageReaderExecutor } from "./system-tools/image-reader"
import { createUrlReaderExecutor } from "./system-tools/url-reader"

export type ReplyByAIProps = {
  conversation: ConversationModel
  contactInboxId: string
  channel?: string
  messages: ModelMessage[]
  aiAgent: AIAgentModel
  triggerMessageId?: string
  fileOnlyTrigger: boolean
  allowedSystemFunctionIds?: string[]
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
  directSendTracker: { sent: boolean; sentText: string }
  model: LanguageModel
  modelId: string
  props: ReplyByAIProps
  provider: string
  providerInstance: AIProviderInstance
}) {
  const { conversation, aiAgent } = options.props
  const tools = filterToolsByAllowedSystemFunctions(
    aiAgent.tools,
    options.props.allowedSystemFunctionIds,
  )
  const webSearchToolValue = `${toolPrefixes.enum.sys}:${systemFunctionNames.webSearch}`
  const hasWebSearchTool = tools.includes(webSearchToolValue)
  const toolsetTools = hasWebSearchTool
    ? tools.filter((tool) => tool !== webSearchToolValue)
    : tools
  const nativeWebSearchTool = hasWebSearchTool
    ? createNativeWebSearchTool({
        aiAgent,
        conversation,
        modelId: options.modelId,
        provider: options.provider,
        providerInstance: options.providerInstance,
      })
    : { tool: undefined, omitReason: undefined }

  return getAIToolset({
    workspaceId: aiAgent.workspaceId,
    tools: toolsetTools,
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
      sendMessage: async (text: string) => {
        options.directSendTracker.sent = true
        options.directSendTracker.sentText = text
        if (text) {
          await sendMessageAndWait(conversation.id, text)
        }
      },
      triggerFlow: async (flowId: string) => {
        await integrationQueue.add(IntegrationJobAction.sendFlow, {
          type: IntegrationJobAction.sendFlow,
          data: {
            conversationId: conversation.id,
            contactInboxId: options.props.contactInboxId,
            flowId,
          },
        })
      },
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
  }).then((toolset) => ({
    cleanup: toolset.cleanup,
    tools: {
      ...toolset.tools,
      ...(nativeWebSearchTool.tool
        ? { [systemFunctionNames.webSearch]: nativeWebSearchTool.tool }
        : {}),
    },
    webSearchOmitReason: nativeWebSearchTool.omitReason,
  }))
}

// gpt-4o-mini and its variants reject the `filters` param at the API level
const OPENAI_MODELS_WITHOUT_SEARCH_FILTER = new Set([
  "gpt-4o-mini",
  "gpt-4o-mini-2024-07-18",
  "gpt-4o-mini-search-preview",
  "gpt-4o-mini-search-preview-2025-03-11",
])

function openAIModelSupportsWebSearchFilter(modelId: string): boolean {
  return !OPENAI_MODELS_WITHOUT_SEARCH_FILTER.has(modelId)
}

function createNativeWebSearchTool(options: {
  aiAgent: AIAgentModel
  conversation: ConversationModel
  modelId: string
  provider: string
  providerInstance: AIProviderInstance
}): { omitReason?: string; tool?: ToolSet[string] } {
  const rawDomains = options.aiAgent.webSearchAuthorizedDomains
  const authorizedDomains = normalizeAuthorizedWebSearchDomains(rawDomains)
  const authorizedDomainsCount = authorizedDomains.length

  logger.info(
    {
      provider: options.provider,
      modelId: options.modelId,
      conversationId: options.conversation.id,
      workspaceId: options.conversation.workspaceId,
      rawDomains,
      authorizedDomains,
      authorizedDomainsCount,
      hasProviderTools: "tools" in options.providerInstance,
    },
    "[automated-response] createNativeWebSearchTool: domain filter check",
  )

  if (options.provider === aiProviders.enum.openai) {
    if (!("tools" in options.providerInstance)) {
      logWebSearchOmit({
        authorizedDomainsCount,
        conversationId: options.conversation.id,
        modelId: options.modelId,
        provider: options.provider,
        reason: "provider_web_search_not_supported",
        workspaceId: options.conversation.workspaceId,
      })

      return { omitReason: "provider_not_supported" }
    }

    const modelSupportsDomainFilter = openAIModelSupportsWebSearchFilter(
      options.modelId,
    )

    if (authorizedDomains.length > 0 && !modelSupportsDomainFilter) {
      logWebSearchOmit({
        authorizedDomainsCount,
        conversationId: options.conversation.id,
        modelId: options.modelId,
        provider: options.provider,
        reason: "model_domain_filter_not_supported",
        workspaceId: options.conversation.workspaceId,
      })

      return { omitReason: "model_domain_filter_not_supported" }
    }

    const providerTools = options.providerInstance.tools

    if ("webSearch" in providerTools) {
      const filters =
        authorizedDomains.length > 0 && modelSupportsDomainFilter
          ? { allowedDomains: authorizedDomains }
          : undefined

      logger.info(
        {
          provider: options.provider,
          modelId: options.modelId,
          conversationId: options.conversation.id,
          workspaceId: options.conversation.workspaceId,
          filtersApplied: !!filters,
          allowedDomains: filters?.allowedDomains ?? [],
          modelSupportsDomainFilter,
        },
        "[automated-response] createNativeWebSearchTool: openai webSearch tool created",
      )

      return {
        tool: providerTools.webSearch({
          externalWebAccess: true,
          filters,
          searchContextSize: "medium",
        }),
      }
    }
  }

  if (options.provider === aiProviders.enum.gemini) {
    if (authorizedDomains.length > 0) {
      logWebSearchOmit({
        authorizedDomainsCount,
        conversationId: options.conversation.id,
        modelId: options.modelId,
        provider: options.provider,
        reason: "gemini_domain_allowlist_not_supported",
        workspaceId: options.conversation.workspaceId,
      })

      return { omitReason: "domain_allowlist_not_supported" }
    }

    if (!("tools" in options.providerInstance)) {
      logWebSearchOmit({
        authorizedDomainsCount,
        conversationId: options.conversation.id,
        modelId: options.modelId,
        provider: options.provider,
        reason: "provider_web_search_not_supported",
        workspaceId: options.conversation.workspaceId,
      })

      return { omitReason: "provider_not_supported" }
    }

    const providerTools = options.providerInstance.tools

    if ("googleSearch" in providerTools) {
      logger.info(
        {
          provider: options.provider,
          modelId: options.modelId,
          conversationId: options.conversation.id,
          workspaceId: options.conversation.workspaceId,
        },
        "[automated-response] createNativeWebSearchTool: gemini googleSearch tool created (no domain filter)",
      )

      return {
        tool: providerTools.googleSearch({}),
      }
    }
  }

  logWebSearchOmit({
    authorizedDomainsCount,
    conversationId: options.conversation.id,
    modelId: options.modelId,
    provider: options.provider,
    reason: "provider_web_search_not_supported",
    workspaceId: options.conversation.workspaceId,
  })

  return { omitReason: "provider_not_supported" }
}

function logWebSearchOmit(input: {
  authorizedDomainsCount: number
  conversationId: string
  modelId: string
  provider: string
  reason: string
  workspaceId: string
}) {
  logger.warn(
    {
      authorizedDomainsCount: input.authorizedDomainsCount,
      conversationId: input.conversationId,
      modelId: input.modelId,
      provider: input.provider,
      reason: input.reason,
      toolName: systemFunctionNames.webSearch,
      workspaceId: input.workspaceId,
    },
    "[automated-response] web search tool omitted",
  )
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

    const providerInstance = createAIProviderInstance({
      model: integration,
      provider,
    })
    const model = providerInstance(selectedModelId)
    const startTime = Date.now()

    const directSendTracker = { sent: false, sentText: "" }
    const toolset = await createReplyToolset({
      abortSignal,
      directSendTracker,
      model,
      modelId: selectedModelId,
      props,
      provider,
      providerInstance,
    })
    const tools = toolset.tools
    cleanup = toolset.cleanup

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

    const richModeEnabled =
      aiAgent.isRichResponse && Boolean(props.triggerMessageId)
    if (aiAgent.isRichResponse && !props.triggerMessageId) {
      logger.warn(
        {
          workspaceId: conversation.workspaceId,
          conversationId: conversation.id,
          reason: "missing_rich_response_execution_id",
        },
        "[rich-response] rich mode disabled for AI reply",
      )
    }

    const guardedPrompt = appendUnavailableWebSearchPolicy(
      appendHandoffPolicy(
        appendKnowledgeBaseGuard(
          appendFabricationGuard(appendToolOutputGuard(completePrompt), tools),
          tools,
        ),
        tools,
      ),
      toolset.webSearchOmitReason,
    )
    const systemPrompt = richModeEnabled
      ? appendRichResponseFormat(guardedPrompt)
      : guardedPrompt

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

    const hasTools = Object.keys(tools).length > 0
    const result = await streamText({
      model,
      system: systemPrompt,
      messages,
      maxOutputTokens: aiAgent.maxOutputTokens,
      temperature: aiAgent.temperature,
      tools,
      toolChoice: hasTools ? "auto" : "none",
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
        for (const toolResult of toolResults) {
          if (isToolResultError(toolResult)) {
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

    const buildToolStats = () => ({
      steps: stepCount,
      toolCallsCount,
      toolResultsCount,
      toolErrorsCount,
      toolNames: Array.from(toolNamesSet).slice(0, 10),
      finishReasons: finishReasons.slice(0, 10),
    })

    if (richModeEnabled) {
      return handleRichAIReply({
        props,
        textStream: result.textStream,
        directSendTracker,
        provider: provider as AIAgentProvider,
        modelId: selectedModelId,
        startTime,
        buildToolStats,
      })
    }

    const { messageCount, fullText } = await processStreamingText(
      result.textStream,
      async (_segment, parts) => {
        if (directSendTracker.sent) {
          return
        }
        for (const part of parts) {
          await sendMessageAndWait(conversation.id, part)
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
      return { messageCount: 0, fullText: "" }
    })

    if (directSendTracker.sent) {
      if (directSendTracker.sentText) {
        await aiContextService.appendHistory({
          conversationId: conversation.id,
          newMessages: [
            {
              message: {
                role: "assistant",
                content: directSendTracker.sentText,
              },
              createdAt: Date.now(),
            },
          ],
        })
      }
      return {
        responded: true,
        provider: provider as AIAgentProvider,
        modelId: selectedModelId,
        usedFallbackText: false,
        toolStats: buildToolStats(),
      }
    }

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
        toolStats: buildToolStats(),
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
        toolStats: buildToolStats(),
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

function appendUnavailableWebSearchPolicy(
  systemPrompt: string,
  webSearchOmitReason?: string,
): string {
  if (!webSearchOmitReason) {
    return systemPrompt
  }

  return `${systemPrompt}\n\nWEB SEARCH AVAILABILITY (REQUIRED):\n- Web search is configured for this agent but is unavailable for the current provider or domain policy.\n- Do not claim that you searched, browsed, or looked up live web information.\n- Answer only from the conversation and available tools, or ask the user for clarification if live information is required.`.trim()
}

function appendRichResponseFormat(systemPrompt: string): string {
  return `${systemPrompt}\n\n${helpTexts.richResponseFormat}`.trim()
}

function isToolResultError(value: unknown): boolean {
  if (!value || typeof value !== "object" || !("isError" in value)) {
    return false
  }

  return value.isError === true
}
