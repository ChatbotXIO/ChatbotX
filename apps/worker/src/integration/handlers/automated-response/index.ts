import { prisma } from "@aha.chat/database"
import { SenderType } from "@aha.chat/database/types"
import type { OutgoingMessageEntity } from "@aha.chat/sdk"
import type { ModelMessage } from "ai"
import {
  replyByAutomatedResponse,
  replyByGemini,
  replyByOpenAI,
} from "./replies"
import { getSelectedTools } from "./tools"

export async function triggerAutomatedResponse({
  message,
}: {
  message: OutgoingMessageEntity
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
      lastAIMessages.push({ role: "user", content: msg.content })
    } else if (
      msg.senderType === SenderType.user ||
      msg.senderType === SenderType.bot
    ) {
      lastAIMessages.push({ role: "assistant", content: msg.content })
    }
  }
  lastAIMessages.reverse()

  const { tools, availableTools } = await getSelectedTools(aiAgent)

  if (
    await replyByOpenAI({
      message,
      lastAIMessages,
      aiAgent,
      tools,
      availableTools,
    })
  ) {
    return
  }
  if (
    await replyByGemini({
      message,
      lastAIMessages,
      aiAgent,
      tools,
      availableTools,
    })
  ) {
    return
  }
}
