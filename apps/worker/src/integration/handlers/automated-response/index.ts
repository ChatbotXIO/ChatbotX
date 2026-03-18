import { db } from "@aha.chat/database/client"
import type { IntegrationJobTriggerAutomatedResponse } from "@aha.chat/worker-config"
import type { ModelMessage } from "ai"
import { getAIToolset } from "../generate-text/tools"
import {
  replyByAutomatedResponse,
  replyByGemini,
  replyByOpenAI,
} from "./replies"
import { createTrackingContext, trackBotResponse } from "./track-bot-response"

export async function triggerAutomatedResponse(
  props: IntegrationJobTriggerAutomatedResponse["data"],
) {
  const { message } = props
  const messageId = (message as { id?: string }).id ?? ""
  const startTime = Date.now()
  if (!message.content) {
    await trackBotResponse({
      chatbotId: message.chatbotId,
      conversationId: message.conversationId,
      messageId,
      hasResponse: false,
      responseType: "none",
      routeType: "FALLBACK",
      result: "fallback",
      aiProvider: "none",
      startTime: Date.now(),
      metadata: {
        fallbackReason: "NO_CONTENT",
      },
      triggerContext: {
        triggerSource: "worker",
        triggerHandler: "triggerAutomatedResponse",
        triggerType: "bot_response_fallback_no_content",
      },
    })

    return
  }

  if (
    await replyByAutomatedResponse(
      props,
      createTrackingContext({
        messageId,
        chatbotId: message.chatbotId,
        conversationId: message.conversationId,
        responseType: "automated_response",
        aiProvider: "none",
        triggerType: "bot_response_automated_response",
      }),
    )
  ) {
    return
  }

  const aiAgent = await db.query.aiAgentModel.findFirst({
    where: { chatbotId: message.chatbotId, isDefault: true },
  })
  if (!aiAgent) {
    // No AI Agent configured → Route to FALLBACK
    await trackBotResponse({
      chatbotId: message.chatbotId,
      conversationId: message.conversationId,
      messageId,
      hasResponse: false,
      responseType: "none",
      routeType: "FALLBACK",
      result: "fallback",
      aiProvider: "none",
      metadata: {
        fallbackReason: "NO_AI_AGENT",
      },
      startTime,
      triggerContext: {
        triggerSource: "worker",
        triggerHandler: "triggerAutomatedResponse",
        triggerType: "bot_response_fallback_no_ai_agent",
      },
    })
    return
  }

  const last100Messages = await db.query.messageModel.findMany({
    where: { conversationId: message.conversationId },
    orderBy: { createdAt: "desc" },
    limit: 100,
  })
  const lastAIMessages: ModelMessage[] = []
  for (const msg of last100Messages) {
    if (!msg.content) {
      continue
    }
    if (msg.senderType === "contact") {
      lastAIMessages.push({
        role: "user",
        content: msg.content,
      })
    } else if (msg.senderType === "user" || msg.senderType === "bot") {
      lastAIMessages.push({ role: "assistant", content: msg.content })
    }
  }
  lastAIMessages.reverse()

  const toolset = await getAIToolset(aiAgent.chatbotId, aiAgent.tools)

  if (
    await replyByOpenAI(
      {
        message,
        lastAIMessages,
        aiAgent,
        tools: toolset,
        availableTools: {
          fileTools: [],
          functionTools: [],
          mcpTools: [],
        },
      },
      createTrackingContext({
        messageId,
        chatbotId: message.chatbotId,
        conversationId: message.conversationId,
        responseType: "ai_agent",
        aiProvider: "openai",
        triggerType: "bot_response_ai_agent_openai",
      }),
    )
  ) {
    // Step 3: AI Agent exists → Route to AGENT
    await trackBotResponse({
      chatbotId: message.chatbotId,
      conversationId: message.conversationId,
      messageId,
      hasResponse: true,
      responseType: "ai_agent",
      routeType: "AGENT",
      result: "success",
      aiProvider: "openai",
      startTime,
    })
    return
  }
  if (
    await replyByGemini(
      {
        message,
        lastAIMessages,
        aiAgent,
        tools: toolset,
        availableTools: {
          fileTools: [],
          functionTools: [],
          mcpTools: [],
        },
      },
      createTrackingContext({
        messageId,
        chatbotId: message.chatbotId,
        conversationId: message.conversationId,
        responseType: "ai_agent",
        aiProvider: "gemini",
        triggerType: "bot_response_ai_agent_gemini",
      }),
    )
  ) {
    return
  }

  // Step 4: AI Agent failed to respond → Still routed to AGENT, but response failed
  // This is NOT fallback - routing decision was AGENT, but execution failed
  await trackBotResponse({
    chatbotId: message.chatbotId,
    conversationId: message.conversationId,
    messageId,
    hasResponse: false,
    responseType: "ai_agent",
    routeType: "AGENT",
    result: "success",
    aiProvider: "none",
    metadata: {
      fallbackReason: "NO_INTENT_MATCH",
    },
    startTime,
    triggerContext: {
      triggerSource: "worker",
      triggerHandler: "triggerAutomatedResponse",
      triggerType: "bot_response_ai_agent_failed",
    },
  })
}
