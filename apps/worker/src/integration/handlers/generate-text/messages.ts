import { prisma } from "@aha.chat/database"
import { AIMessageRole, SenderType } from "@aha.chat/database/types"
import {
  DEFAULT_USER_MESSAGES,
  MAX_CONVERSATION_HISTORY,
} from "../automated-response/constants"
import type { AIGenerateTextStep, AIMessage, AIMessageRoleForAI } from "./types"

export async function buildAIMessages(
  conversationId: string,
  step: AIGenerateTextStep,
): Promise<AIMessage[]> {
  const messages: AIMessage[] = []

  if (step.rememberConversation) {
    const lastMessages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: MAX_CONVERSATION_HISTORY,
    })

    for (const msg of lastMessages) {
      if (!msg.content) {
        continue
      }

      if (msg.senderType === SenderType.contact) {
        messages.push({
          role: AIMessageRole.user as AIMessageRoleForAI,
          content: msg.content,
        })
      } else if (
        msg.senderType === SenderType.user ||
        msg.senderType === SenderType.bot
      ) {
        messages.push({
          role: AIMessageRole.assistant as AIMessageRoleForAI,
          content: msg.content,
        })
      }
    }

    messages.reverse()
  }

  if (step.userMessage) {
    messages.push({
      role: AIMessageRole.user as AIMessageRoleForAI,
      content: step.userMessage,
    })
  }

  if (messages.length === 0) {
    const defaultMessage = step.prompt
      ? DEFAULT_USER_MESSAGES.withPrompt
      : DEFAULT_USER_MESSAGES.withoutPrompt

    messages.push({
      role: AIMessageRole.user as AIMessageRoleForAI,
      content: defaultMessage,
    })
  }

  return messages
}
