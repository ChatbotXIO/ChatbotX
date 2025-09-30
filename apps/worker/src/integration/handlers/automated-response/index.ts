import { prisma } from "@aha.chat/database"
import { SenderType } from "@aha.chat/database/types"
import type { OutgoingMessageEntity } from "@aha.chat/sdk"
import { ROLES } from "./constants"
import {
  replyByAutomatedResponse,
  replyByGemini,
  replyByOpenAI,
} from "./replies"
import { getSelectedTools } from "./tools"
import type { AIMessage } from "./types"

export const listAllEnabledAutomatedResponses = async ({
  chatbotId,
}: {
  chatbotId: string
}) => {
  try {
    return await prisma.automatedResponse.findMany({
      where: { chatbotId, status: true },
    })
  } catch (_err) {
    return []
  }
}

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
  const lastAIMessages: AIMessage[] = []
  for (const msg of last100Messages) {
    if (!msg.content) {
      continue
    }
    if (msg.senderType === SenderType.CONTACT) {
      lastAIMessages.push({ role: ROLES.user, content: msg.content })
    } else if (
      msg.senderType === SenderType.USER ||
      msg.senderType === SenderType.BOT
    ) {
      lastAIMessages.push({ role: ROLES.assistant, content: msg.content })
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
