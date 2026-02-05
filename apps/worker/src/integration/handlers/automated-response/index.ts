import { db } from "@aha.chat/database/client"
import type { IntegrationJobTriggerAutomatedResponse } from "@aha.chat/worker-config"
import { createId } from "@paralleldrive/cuid2"
import type { ModelMessage } from "ai"
import { getAIToolset } from "../generate-text/tools"
import {
  replyByAutomatedResponse,
  replyByGemini,
  replyByOpenAI,
} from "./replies"
import { trackBotResponse } from "./track-bot-response"

export async function triggerAutomatedResponse(
  props: IntegrationJobTriggerAutomatedResponse["data"],
) {
  const { message } = props
  if (!message.content) {
    return
  }

  const startTime = Date.now()
  const messageId = createId()

  if (await replyByAutomatedResponse(props)) {
    await trackBotResponse({
      chatbotId: message.chatbotId,
      conversationId: message.conversationId,
      messageId,
      hasResponse: true,
      responseType: "automated_response",
      result: "success",
      aiProvider: "none",
      startTime,
    })
    return
  }

  const aiAgent = await db.query.aiAgentModel.findFirst({
    where: { chatbotId: message.chatbotId, isDefault: true },
  })
  if (!aiAgent) {
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
    await replyByOpenAI({
      message,
      lastAIMessages,
      aiAgent,
      tools: toolset,
      availableTools: {
        fileTools: [],
        functionTools: [],
        mcpTools: [],
      },
    })
  ) {
    await trackBotResponse({
      chatbotId: message.chatbotId,
      conversationId: message.conversationId,
      messageId,
      hasResponse: true,
      responseType: "ai_agent",
      result: "success",
      aiProvider: "openai",
      startTime,
    })
    return
  }
  if (
    await replyByGemini({
      message,
      lastAIMessages,
      aiAgent,
      tools: toolset,
      availableTools: {
        fileTools: [],
        functionTools: [],
        mcpTools: [],
      },
    })
  ) {
    await trackBotResponse({
      chatbotId: message.chatbotId,
      conversationId: message.conversationId,
      messageId,
      hasResponse: true,
      responseType: "ai_agent",
      result: "success",
      aiProvider: "gemini",
      startTime,
    })
    return
  }

  await trackBotResponse({
    chatbotId: message.chatbotId,
    conversationId: message.conversationId,
    messageId,
    hasResponse: false,
    responseType: "none",
    aiProvider: "none",
    metadata: {
      fallbackReason: "NO_INTENT_MATCH",
    },
    startTime,
  })
}
