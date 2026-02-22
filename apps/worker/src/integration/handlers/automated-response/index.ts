import { prisma } from "@aha.chat/database"
import { AIMessageRole, SenderType } from "@aha.chat/database/types"
import type { OutgoingMessage } from "@aha.chat/sdk"
import type { ModelMessage } from "ai"
import { getAIToolset } from "../generate-text/tools"
import {
  replyByAutomatedResponse,
  replyByGemini,
  replyByOpenAI,
} from "./replies"

export async function triggerAutomatedResponse({
  message,
}: {
  message: OutgoingMessage
}) {
  if (!message.content) {
    return
  }

  if (await replyByAutomatedResponse({ message })) {
    return
  }

  const aiAgent = await prisma.aIAgent.findFirst({
    where: { chatbotId: message.chatbotId, isDefault: true },
  })
  if (!aiAgent) {
    return
  }

  const last100Messages = await prisma.message.findMany({
    where: { conversationId: message.conversationId },
    orderBy: { createdAt: "desc" },
    take: 100,
  })
  const lastAIMessages: ModelMessage[] = []
  for (const msg of last100Messages) {
    if (!msg.content) {
      continue
    }
    if (msg.senderType === SenderType.contact) {
      lastAIMessages.push({
        role: AIMessageRole.user,
        content: msg.content,
      })
    } else if (
      msg.senderType === SenderType.user ||
      msg.senderType === SenderType.bot
    ) {
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
