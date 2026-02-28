import { db } from "@aha.chat/database/client"
import type { IntegrationJobTriggerAutomatedResponse } from "@aha.chat/worker-config"
import type { ModelMessage } from "ai"
import { getAIToolset } from "../generate-text/tools"
import {
  replyByAutomatedResponse,
  replyByGemini,
  replyByOpenAI,
} from "./replies"

export async function triggerAutomatedResponse(
  props: IntegrationJobTriggerAutomatedResponse["data"],
) {
  const { message } = props
  if (!message.content) {
    return
  }

  if (await replyByAutomatedResponse(props)) {
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
    return
  }
}
