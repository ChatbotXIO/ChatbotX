import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { db } from "@chatbotx.io/database/client"
import { aiMessageRoles } from "@chatbotx.io/database/partials"
import { type AIProvider, aiProviders } from "@chatbotx.io/flow-config"
import type { SecretTextAuthValue } from "@chatbotx.io/sdk"
import {
  type BotResponseTrackingContext,
  ChatJobAction,
  chatQueue,
  IntegrationJobAction,
  type IntegrationJobTriggerAutomatedResponse,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { type LanguageModel, type ModelMessage, streamText } from "ai"
import { TEXT } from "./constants"
import { processStreamingText, sendMessageWithRender } from "./text"
import type { ReplyByAIProps } from "./types"

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
}) {
  return await db.query.automatedResponseModel.findMany({
    where: { workspaceId, status: true },
    orderBy: { createdAt: "desc" },
  })
}

export async function replyByAutomatedResponse(
  props: IntegrationJobTriggerAutomatedResponse["data"],
  trackingContext: BotResponseTrackingContext,
): Promise<boolean> {
  const { message, conversation } = props

  let replied = false

  const allAutomatedResponses = await listAllEnabledAutomatedResponses({
    workspaceId: message.workspaceId,
  })
  if (allAutomatedResponses.length === 0) {
    return false
  }

  for (const automatedResponse of allAutomatedResponses) {
    const matched = automatedResponse.userMessages
      .map((v) => v.toLowerCase())
      .some((v) => (message.text ?? "").toLowerCase().includes(v))

    if (matched) {
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
          where: { id: automatedResponse.flowId },
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
  }
  return replied
}

export function replyByGemini(
  props: ReplyByAIProps,
  trackingContext: BotResponseTrackingContext,
): Promise<boolean> {
  return runAIReply(
    props,
    {
      provider: aiProviders.enum.gemini,
      fetchIntegration: async (workspaceId: string) => {
        const integration = await db.query.integrationGeminiModel.findFirst({
          where: { workspaceId, autoReply: true },
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
      provider: aiProviders.enum.openai,
      fetchIntegration: async (workspaceId: string) => {
        const integration = await db.query.integrationOpenaiModel.findFirst({
          where: { workspaceId, autoReply: true },
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
  fetchIntegration: (workspaceId: string) => Promise<unknown>
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
    const auth = await cfg.fetchIntegration(message.workspaceId)
    if (!auth) {
      return false
    }

    const apiKey = (auth as SecretTextAuthValue)?.secretText

    if (!apiKey || apiKey.length === 0) {
      return false
    }

    const clientFactory = cfg.createClient(apiKey)

    const selectedModel = (
      aiAgent.models as { provider: AIProvider; model: string }[]
    ).find((v) => v.provider === cfg.provider)
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
