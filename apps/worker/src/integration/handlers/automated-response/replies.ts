import { db } from "@aha.chat/database/client"
import {
  type AIAgentProvider,
  AIMessageRole,
  type AutomatedResponseReply,
  ReplyType,
} from "@aha.chat/database/types"
import { aiProviders } from "@aha.chat/flow-config"
import {
  type BotResponseTrackingContext,
  ChatJobAction,
  chatQueue,
  IntegrationJobAction,
  type IntegrationJobTriggerAutomatedResponse,
  integrationQueue,
} from "@aha.chat/worker-config"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { type LanguageModel, type ModelMessage, streamText } from "ai"
import { TEXT } from "./constants"
import { processStreamingText, sendMessageWithRender } from "./text"
import type { ReplyByAIProps, SecretTextAuthValue } from "./types"

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
  chatbotId,
}: {
  chatbotId: string
}) {
  return await db.query.automatedResponseModel.findMany({
    where: { chatbotId, status: true },
    orderBy: { createdAt: "desc" },
  })
}

export async function replyByAutomatedResponse(
  props: IntegrationJobTriggerAutomatedResponse["data"],
  trackingContext: BotResponseTrackingContext,
): Promise<boolean> {
  const { message, conversation } = props

  let replied = false
  let isFlow = false
  let flowId: string | undefined
  let automatedResponseId: string | undefined

  const allAutomatedResponses = await listAllEnabledAutomatedResponses({
    chatbotId: message.chatbotId,
  })
  if (allAutomatedResponses.length === 0) {
    return { replied: false, isFlow: false }
  }

  for (const automatedResponse of allAutomatedResponses) {
    const matched = automatedResponse.userMessages
      .map((v) => v.toLowerCase())
      .some((v) => (message.content ?? "").toLowerCase().includes(v))

    if (matched) {
      automatedResponseId = automatedResponse.id
      for (const reply of automatedResponse.replies as AutomatedResponseReply[]) {
        switch (reply.type) {
          case ReplyType.Message: {
            if (reply.message) {
              const stepMessage = await replaceCustomFieldAttributes(
                reply.message,
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
            }
            replied = true
            break
          }
          case ReplyType.Flow: {
            const flow = await db.query.flowModel.findFirst({
              where: { id: reply.flowId },
            })
            if (flow?.currentVersionId) {
              await integrationQueue.add(IntegrationJobAction.sendFlow, {
                type: IntegrationJobAction.sendFlow,
                data: {
                  conversationId: message.conversationId,
                  flowId: flow.id,
                  trackingContext,
                },
              })
              replied = true
              isFlow = true
              flowId = flow.id
            }
            break
          }
          default:
            break
        }
      }
    }
  }
  return { replied, isFlow, flowId, automatedResponseId }
}

export function replyByGemini(
  props: ReplyByAIProps,
  trackingContext: BotResponseTrackingContext,
): Promise<boolean> {
  return runAIReply(
    props,
    {
      provider: aiProviders.gemini,
      fetchIntegration: async (chatbotId: string) => {
        const integration = await db.query.integrationGeminiModel.findFirst({
          where: { chatbotId, autoReply: true },
        })
        return integration?.auth
      },
      createClient: (apiKey: string) => createGoogleGenerativeAI({ apiKey }),
      onFollowUpError: async () => true,
    },
    trackingContext,
  )
}

export function replyByOpenAI(
  props: ReplyByAIProps,
  trackingContext: BotResponseTrackingContext,
): Promise<boolean> {
  return runAIReply(
    props,
    {
      provider: aiProviders.openai,
      fetchIntegration: async (chatbotId: string) => {
        const integration = await db.query.integrationOpenAIModel.findFirst({
          where: { chatbotId, autoReply: true },
        })
        return integration?.auth
      },
      createClient: (apiKey: string) => createOpenAI({ apiKey }),
      onFollowUpError: async (ctx) => {
        const fallbackMessage = `${TEXT.foundProductsFallbackPrefix}\n\n${ctx.toolResultsText}`
        await sendMessageWithRender(
          ctx.conversationId,
          fallbackMessage,
          trackingContext,
        )
        return true
      },
    },
    trackingContext,
  )
}

type ProviderRunnerConfig = {
  provider: (typeof aiProviders)[keyof typeof aiProviders]
  fetchIntegration: (chatbotId: string) => Promise<unknown>
  createClient: (apiKey: string) => (modelName: string) => LanguageModel
  onFollowUpError: (ctx: {
    conversationId: string
    toolResultsText: string
  }) => Promise<boolean>
}

async function runAIReply(
  props: ReplyByAIProps,
  cfg: ProviderRunnerConfig,
  trackingContext: BotResponseTrackingContext,
): Promise<boolean> {
  const { message, lastAIMessages, aiAgent, tools } = props
  try {
    const auth = await cfg.fetchIntegration(message.chatbotId)
    if (!auth) {
      return false
    }

    const apiKey = (auth as SecretTextAuthValue)?.secretText

    if (!apiKey || apiKey.length === 0) {
      return false
    }

    const clientFactory = cfg.createClient(apiKey)

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
      maxOutputTokens: aiAgent.maxOutputTokens,
      temperature: aiAgent.temperature,
      tools,
      toolChoice: Object.keys(tools).length > 0 ? "auto" : undefined,
    })

    const toolCalls = await result.toolCalls
    const toolResults = await result.toolResults
    const { messageCount, fullText } = await processStreamingText(
      result.textStream,
      message.conversationId,
      { sendParts: true, trackingContext },
    )

    if (toolCalls && toolCalls.length > 0) {
      const toolResultsText = toolResults
        .map((r) => `Tool ${r.toolName} result: ${r.output}`)
        .join("\n\n")
      const followUpMessages: ModelMessage[] = [
        ...lastAIMessages,
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
          model: clientFactory(modelName),
          system: completePrompt,
          messages: followUpMessages,
          maxOutputTokens: aiAgent.maxOutputTokens,
          temperature: aiAgent.temperature,
        })
        const { messageCount: followUpMessageCount } =
          await processStreamingText(
            followUpResult.textStream,
            message.conversationId,
            { sendParts: true, trackingContext },
          )
        if (followUpMessageCount > 0) {
          return true
        }
      } catch (_error) {
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
  } catch (_error) {
    return false
  }
}
