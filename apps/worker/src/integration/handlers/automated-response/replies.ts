import { prisma } from "@aha.chat/database"
import {
  type AIAgentProvider,
  type AutomatedResponseReply,
  ReplyType,
} from "@aha.chat/database/types"
import { StepType } from "@aha.chat/flow-config"
import type { SecretTextAuthValue } from "@aha.chat/sdk"
import {
  ChatJobAction,
  chatQueue,
  IntegrationJobAction,
  integrationQueue,
} from "@aha.chat/worker-config"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { createId } from "@paralleldrive/cuid2"
import { type LanguageModel, type ModelMessage, streamText } from "ai"
import { logger } from "../../../lib/logger"
import { AI_PROVIDERS, TEXT } from "./constants"
import { processStreamingText, sendMessageWithRender } from "./text"
import type { ReplyByAIProps } from "./types"

async function replaceCustomFieldAttributes(
  message: string,
  conversationId: string,
): Promise<string> {
  try {
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId },
      include: {
        contact: {
          include: {
            contactCustomFields: {
              include: {
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
  } catch (error) {
    logger.error("[automated-response] replaceCustomFieldAttributes failed", {
      error,
      conversationId,
    })
    return message
  }
}

async function listAllEnabledAutomatedResponses({
  chatbotId,
}: {
  chatbotId: string
}) {
  try {
    return await prisma.automatedResponse.findMany({
      where: { chatbotId, status: true },
    })
  } catch (error) {
    logger.error(
      "[automated-response] listAllEnabledAutomatedResponses failed",
      { error, chatbotId },
    )
    return []
  }
}

export async function replyByAutomatedResponse({
  message,
}: {
  message: {
    content?: string | null
    conversationId: string
    chatbotId: string
  }
}): Promise<boolean> {
  let replied = false
  const allAutomatedResponses = await listAllEnabledAutomatedResponses({
    chatbotId: message.chatbotId,
  })
  if (allAutomatedResponses.length === 0) {
    return false
  }

  for (const automatedResponse of allAutomatedResponses) {
    const matched = automatedResponse.userMessages
      .map((v) => v.toLowerCase())
      .some((v) => (message.content ?? "").toLowerCase().includes(v))

    if (matched) {
      for (const reply of automatedResponse.replies as AutomatedResponseReply[]) {
        switch (reply.type) {
          case ReplyType.Message:
            await chatQueue.add(ChatJobAction.sendFlowMessage, {
              type: ChatJobAction.sendFlowMessage,
              data: {
                conversationId: message.conversationId,
                flowId: "",
                flowVersionId: "",
                step: {
                  id: createId(),
                  message: reply.message ?? "",
                  stepType: StepType.sendText,
                  buttons: [],
                },
              },
            })
            replied = true
            break
          case ReplyType.Flow: {
            const flow = await prisma.flow.findFirst({
              where: { id: reply.flowId },
            })
            if (flow?.currentVersionId) {
              await integrationQueue.add(IntegrationJobAction.sendFlow, {
                type: IntegrationJobAction.sendFlow,
                data: {
                  conversationId: message.conversationId,
                  flowId: flow.id,
                },
              })
              replied = true
            }
            break
          }
          default:
            break
        }
      }
    }
  }
  return replied
}

export function replyByGemini(props: ReplyByAIProps): Promise<boolean> {
  return runAIReply(props, {
    provider: AI_PROVIDERS.GEMINI,
    fetchIntegration: async (chatbotId: string) =>
      prisma.integrationGemini.findFirst({
        where: { chatbotId, autoReply: true },
      }),
    createClient: (apiKey: string) => createGoogleGenerativeAI({ apiKey }),
    onFollowUpError: async () => true,
  })
}

export function replyByOpenAI(props: ReplyByAIProps): Promise<boolean> {
  return runAIReply(props, {
    provider: AI_PROVIDERS.OPENAI,
    fetchIntegration: async (chatbotId: string) =>
      prisma.integrationOpenAI.findFirst({
        where: { chatbotId, autoReply: true },
      }),
    createClient: (apiKey: string) => createOpenAI({ apiKey }),
    onFollowUpError: async (ctx) => {
      const fallbackMessage = `${TEXT.foundProductsFallbackPrefix}\n\n${ctx.toolResultsText}`
      await sendMessageWithRender(ctx.conversationId, fallbackMessage)
      return true
    },
  })
}

type ProviderRunnerConfig = {
  provider: (typeof AI_PROVIDERS)[keyof typeof AI_PROVIDERS]
  fetchIntegration: (chatbotId: string) => Promise<{ auth: unknown } | null>
  createClient: (apiKey: string) => (modelName: string) => LanguageModel
  onFollowUpError: (ctx: {
    conversationId: string
    toolResultsText: string
  }) => Promise<boolean>
}

async function runAIReply(
  props: ReplyByAIProps,
  cfg: ProviderRunnerConfig,
): Promise<boolean> {
  const { message, lastAIMessages, aiAgent, tools } = props
  try {
    const integration = await cfg.fetchIntegration(message.chatbotId)
    if (!integration) {
      return false
    }

    const clientFactory = cfg.createClient(
      (integration.auth as SecretTextAuthValue | null)?.secretText || "",
    )
    const selectedModel = (aiAgent.models as AIAgentProvider[]).find(
      (v) => v.provider === cfg.provider,
    )
    if (!selectedModel) {
      return false
    }
    const selectedModelValue = selectedModel.model
    if (
      typeof selectedModelValue !== "string" ||
      selectedModelValue.length === 0
    ) {
      return false
    }
    const modelName = selectedModelValue

    const completePrompt = await replaceCustomFieldAttributes(
      aiAgent.prompt || "",
      message.conversationId,
    )

    const result = await streamText({
      model: clientFactory(modelName),
      system: completePrompt,
      messages: lastAIMessages,
      maxOutputTokens: aiAgent.maxTokens,
      temperature: aiAgent.temperature,
      tools,
      toolChoice: Object.keys(tools).length > 0 ? "auto" : undefined,
    })

    const toolCalls = await result.toolCalls
    if (toolCalls && toolCalls.length > 0) {
      try {
        const planned = toolCalls.map((t) => t.toolName).join(", ")
        logger.info(`[AI_TOOL] Planned tool calls: ${planned}`)
      } catch {
        // ignore
      }
    }
    const toolResults = await result.toolResults
    if (toolResults && toolResults.length > 0) {
      for (const r of toolResults) {
        try {
          const outputPreview =
            typeof r.output === "string"
              ? r.output.slice(0, 200)
              : JSON.stringify(r.output).slice(0, 200)
          logger.info(`[AI_TOOL] Result: ${r.toolName} -> ${outputPreview}`)
        } catch {
          // ignore
        }
      }
    }

    const { messageCount, fullText } = await processStreamingText(
      result.textStream,
      message.conversationId,
      { sendParts: true },
    )

    if (toolCalls && toolCalls.length > 0) {
      const toolResultsText = toolResults
        .map((r) => `Tool ${r.toolName} result: ${r.output}`)
        .join("\n\n")
      const followUpMessages: ModelMessage[] = [
        ...lastAIMessages,
        {
          role: "assistant",
          content: fullText || TEXT.assistantFoundPrefix,
        },
        {
          role: "user",
          content: `${TEXT.followUpInstruction}\n\n${toolResultsText}`,
        },
      ]
      try {
        const followUpResult = await streamText({
          model: clientFactory(modelName),
          system: completePrompt,
          messages: followUpMessages,
          maxOutputTokens: aiAgent.maxTokens,
          temperature: aiAgent.temperature,
        })
        const { messageCount: followUpMessageCount } =
          await processStreamingText(
            followUpResult.textStream,
            message.conversationId,
            { sendParts: true },
          )
        if (followUpMessageCount > 0) {
          return true
        }
      } catch (error) {
        logger.error("[automated-response] follow-up streamText failed", {
          error,
          provider: cfg.provider,
          conversationId: message.conversationId,
        })
        return await cfg.onFollowUpError({
          conversationId: message.conversationId,
          toolResultsText,
        })
      }
    }

    if (messageCount > 0) {
      return true
    }
    return false
  } catch (error) {
    logger.error("[automated-response] runAIReply failed", {
      error,
      provider: cfg.provider,
      chatbotId: message.chatbotId,
    })
    return false
  }
}
