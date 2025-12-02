import { prisma } from "@aha.chat/database"
import { SenderType } from "@aha.chat/database/types"
import {
  DEFAULT_USER_MESSAGES,
  MAX_CONVERSATION_HISTORY,
} from "../automated-response/constants"
import type { AIMessage, AIGenerateTextStep } from "./types"

// Build messages array from conversation history and step config
export async function buildAIMessages(
  conversationId: string,
  step: AIGenerateTextStep,
): Promise<AIMessage[]> {
  const messages: AIMessage[] = []

  // Load conversation history if enabled
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
        messages.push({ role: "user", content: msg.content })
      } else if (
        msg.senderType === SenderType.user ||
        msg.senderType === SenderType.bot
      ) {
        messages.push({ role: "assistant", content: msg.content })
      }
    }

    // Reverse to get chronological order
    messages.reverse()
  }

  // Add current user message if provided
  if (step.userMessage) {
    messages.push({
      role: "user",
      content: step.userMessage,
    })
  }

  // Ensure at least one message exists (AI SDK requirement)
  if (messages.length === 0) {
    const defaultMessage = step.prompt
      ? DEFAULT_USER_MESSAGES.withPrompt
      : DEFAULT_USER_MESSAGES.withoutPrompt

    messages.push({
      role: "user",
      content: defaultMessage,
    })
  }

  return messages
}

