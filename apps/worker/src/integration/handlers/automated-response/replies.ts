import { contactVariableService } from "@chatbotx.io/variables"
import { streamText, type ToolSet, tool } from "ai"
import { createAIModelInstance, getAIIntegrationInDB } from "../../../lib/ai"
import { logger } from "../../../lib/logger"
import { isRecord } from "../../../lib/utils"
import { helpTexts } from "./constants"
import { summarizeToolResult } from "./summarizer"
import { processStreamingText, sendMessageWithRender } from "./text"
import type { ReplyByAIProps } from "./types"

type ParsedAIAgentProvider = {
  provider: string
  model: string
}

function parseAIAgentProviders(value: unknown): ParsedAIAgentProvider[] {
  if (!Array.isArray(value)) {
    return []
  }

  const parsed: ParsedAIAgentProvider[] = []
  for (const item of value) {
    if (!isRecord(item)) {
      continue
    }
    const provider = item.provider
    const model = item.model
    if (typeof provider !== "string" || typeof model !== "string") {
      continue
    }
    const trimmedProvider = provider.trim()
    const trimmedModel = model.trim()
    if (!(trimmedProvider && trimmedModel)) {
      continue
    }
    parsed.push({ provider: trimmedProvider, model: trimmedModel })
  }
  return parsed
}

export async function replyByAI(props: ReplyByAIProps): Promise<boolean> {
  const { aiAgent } = props
  const providers = parseAIAgentProviders(aiAgent.models)

  for (const providerInfo of providers) {
    const success = await runAIReply(props, providerInfo)
    if (success) {
      return true
    }
  }

  return false
}

async function runAIReply(
  props: ReplyByAIProps,
  providerInfo: ParsedAIAgentProvider,
): Promise<boolean> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 120_000)

  const { conversation, lastAIMessages, aiAgent, tools } = props
  const variables = await contactVariableService.getAll(conversation.contactId)

  const provider = providerInfo.provider
  try {
    const selectedModelId = providerInfo.model

    const integration = await getAIIntegrationInDB({
      workspaceId: conversation.workspaceId,
      provider,
      autoReply: true,
    })

    if (!integration) {
      return false
    }

    const model = createAIModelInstance({
      model: integration,
      provider,
      modelId: selectedModelId,
      abortSignal: controller.signal,
      traceId: conversation.id,
    })

    const completePrompt = aiAgent.prompt
      ? await contactVariableService.replaceAll({
          text: aiAgent.prompt,
          variables,
        })
      : ""
    const systemPrompt = appendToolOutputGuard(completePrompt)

    const toolExecutions: ToolExecutionLog[] = []
    const toolsWithLogging = wrapToolsWithLogging(tools, {
      conversationId: conversation.id,
      workspaceId: conversation.workspaceId,
      provider,
      onToolResult: (toolName, result, toolCallId) => {
        toolExecutions.push({ toolName, result, toolCallId })
      },
    })

    const result = await streamText({
      model,
      system: systemPrompt,
      messages: lastAIMessages,
      maxOutputTokens: aiAgent.maxOutputTokens,
      temperature: aiAgent.temperature,
      tools: toolsWithLogging,
      toolChoice: Object.keys(toolsWithLogging).length > 0 ? "auto" : undefined,
      // @ts-expect-error - maxSteps is supported in AI SDK v6
      maxSteps: 5,
      abortSignal: controller.signal,
    })

    const { messageCount } = await processStreamingText(
      result.textStream,
      conversation.id,
      { sendParts: true },
    )

    if (messageCount > 0) {
      return true
    }

    const toolSummary = buildToolSummaryForFollowUp(toolExecutions)
    if (toolSummary) {
      const followUpResult = await streamText({
        model,
        system: systemPrompt,
        messages: [
          ...lastAIMessages,
          {
            role: "user",
            content: `${helpTexts.followUpInstruction}\n\n${toolSummary}`,
          },
        ],
        maxOutputTokens: aiAgent.maxOutputTokens,
        temperature: aiAgent.temperature,
        toolChoice: "none",
        // @ts-expect-error - maxSteps is supported in AI SDK v6
        maxSteps: 5,
        abortSignal: controller.signal,
      })

      const { messageCount: followUpCount } = await processStreamingText(
        followUpResult.textStream,
        conversation.id,
        { sendParts: true },
      )

      if (followUpCount > 0) {
        return true
      }
    }

    const fallbackText = buildFallbackTextFromTools(toolExecutions)
    if (fallbackText) {
      await sendMessageWithRender(conversation.id, fallbackText)
      return true
    }

    return false
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
    return false
  } finally {
    clearTimeout(timeoutId)
  }
}

type ToolExecutionLog = {
  toolName: string
  result: unknown
  toolCallId?: string
}

function wrapToolsWithLogging(
  tools: ToolSet,
  ctx: {
    conversationId: string
    workspaceId: string
    provider: string
    onToolResult?: (
      toolName: string,
      result: unknown,
      toolCallId?: string,
    ) => void
  },
): ToolSet {
  const wrapped: ToolSet = {}

  for (const [toolName, originalTool] of Object.entries(tools)) {
    wrapped[toolName] = tool({
      description: originalTool.description,
      inputSchema: originalTool.inputSchema,
      execute: async (input, options) => {
        const startedAt = Date.now()

        try {
          if (!originalTool.execute) {
            throw new Error("Tool execute() is not defined")
          }

          const result = await originalTool.execute(input, options)
          ctx.onToolResult?.(toolName, result, options.toolCallId)
          return result
        } catch (error) {
          logger.error(
            {
              toolName,
              provider: ctx.provider,
              conversationId: ctx.conversationId,
              workspaceId: ctx.workspaceId,
              ms: Date.now() - startedAt,
              error,
            },
            "[automated-response] tool failed",
          )
          throw error
        }
      },
    })
  }

  return wrapped
}

function buildToolSummaryForFollowUp(
  executions: ToolExecutionLog[],
): string | null {
  const summaries: string[] = []
  for (const exec of executions) {
    const text = summarizeToolResult(exec.result)
    if (text) {
      summaries.push(`Tool ${exec.toolName} result:\n${text}`)
    }
  }

  const result = summaries.length > 0 ? summaries.join("\n\n") : null

  return result
}

function buildFallbackTextFromTools(
  executions: ToolExecutionLog[],
): string | null {
  for (let i = executions.length - 1; i >= 0; i--) {
    const exec = executions[i]
    const text = summarizeToolResult(exec.result)
    if (text) {
      return text
    }
  }

  if (executions.length > 0) {
    return helpTexts.fallbackLookup
  }

  return null
}

function appendToolOutputGuard(systemPrompt: string): string {
  return `${systemPrompt}\n\n${helpTexts.toolOutputGuard}`.trim()
}
