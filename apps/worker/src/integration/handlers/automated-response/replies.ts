import { db } from "@chatbotx.io/database/client"
import type { AutomatedResponseModel } from "@chatbotx.io/database/types"
import type {
  BotResponseTrackingContext,
  IntegrationJobTriggerAutomatedResponse,
} from "@chatbotx.io/worker-config"
import {
  ChatJobAction,
  chatQueue,
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
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

export async function replaceCustomFieldAttributes(
  message: string,
  conversationId: string,
): Promise<string> {
  try {
    const conversation = await db.query.conversationModel.findFirst({
      where: { id: conversationId },
      with: {
        contact: {
          with: {
            contactCustomFields: {
              with: {
                customField: true,
              },
            },
          },
        },
      },
    })

    if (!conversation?.contact) {
      return message
    }

    const fieldMap = new Map<string, string>()
    for (const customField of conversation.contact.contactCustomFields) {
      if (customField.customField?.name && customField.value) {
        fieldMap.set(customField.customField.name, customField.value)
      }
    }

    let processedMessage = message
    const attributeRegex = /\{\{(\w+)\}\}/g

    processedMessage = processedMessage.replace(
      attributeRegex,
      (match, fieldName) => {
        const value = fieldMap.get(fieldName)
        return value || match
      },
    )

    return processedMessage
  } catch {
    return message
  }
}

async function listAllEnabledAutomatedResponses({
  workspaceId,
}: {
  workspaceId: string
}): Promise<AutomatedResponseModel[]> {
  try {
    return await db.query.automatedResponseModel.findMany({
      where: { workspaceId, status: true },
    })
  } catch {
    return []
  }
}

export async function replyByAutomatedResponse(
  props: IntegrationJobTriggerAutomatedResponse["data"],
  trackingContext: BotResponseTrackingContext,
): Promise<boolean> {
  const { message, conversation } = props

  try {
    let replied = false
    const allAutomatedResponses = await listAllEnabledAutomatedResponses({
      workspaceId: message.workspaceId,
    })
    if (allAutomatedResponses.length === 0) {
      return false
    }

    for (const automatedResponse of allAutomatedResponses) {
      const text = (message.text ?? "").toLowerCase()
      const matched = (automatedResponse.keywords as string[])
        .map((v) => v.toLowerCase())
        .some((v) => text.includes(v))

      if (!matched) {
        continue
      }

      if (automatedResponse.text) {
        const stepMessage = await replaceCustomFieldAttributes(
          automatedResponse.text,
          message.conversationId,
        )
        await chatQueue.add(ChatJobAction.sendChatMessage, {
          type: ChatJobAction.sendChatMessage,
          data: {
            conversation,
            text: stepMessage,
            trackingContext,
          },
        })
        replied = true
      } else if (automatedResponse.flowId) {
        const flow = await db.query.flowModel.findFirst({
          where: {
            id: automatedResponse.flowId,
            currentVersionId: { isNotNull: true },
          },
        })
        if (flow) {
          await integrationQueue.add(IntegrationJobAction.sendFlow, {
            type: IntegrationJobAction.sendFlow,
            data: {
              conversationId: message.conversationId,
              flowId: flow.id,
              trackingContext,
            },
          })
          replied = true
        }
      }
    }
    return replied
  } catch (error) {
    logger.error(
      {
        error,
        props,
      },
      "[automated-response] replyByAutomatedResponse failed",
    )
    return false
  }
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

  const { message, lastAIMessages, aiAgent, tools } = props
  const provider = providerInfo.provider
  try {
    const selectedModelId = providerInfo.model

    const integration = await getAIIntegrationInDB({
      workspaceId: message.workspaceId,
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
      traceId: message.conversationId,
    })

    const completePrompt = await replaceCustomFieldAttributes(
      aiAgent.prompt || "",
      message.conversationId,
    )
    const systemPrompt = appendToolOutputGuard(completePrompt)

    const toolExecutions: ToolExecutionLog[] = []
    const toolsWithLogging = wrapToolsWithLogging(tools, {
      conversationId: message.conversationId,
      workspaceId: message.workspaceId,
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
      message.conversationId,
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
        message.conversationId,
        { sendParts: true },
      )

      if (followUpCount > 0) {
        return true
      }
    }

    const fallbackText = buildFallbackTextFromTools(toolExecutions)
    if (fallbackText) {
      await sendMessageWithRender(message.conversationId, fallbackText)
      return true
    }

    return false
  } catch (error) {
    logger.error(
      {
        error,
        provider,
        conversationId: message.conversationId,
        workspaceId: message.workspaceId,
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
