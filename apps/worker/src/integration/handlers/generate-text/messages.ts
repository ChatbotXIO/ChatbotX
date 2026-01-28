import { prisma } from "@aha.chat/database"
import {
  AIMessageRole,
  type ConversationModel,
  MessageType,
  SenderType,
} from "@aha.chat/database/types"
import type { AIGenerateTextSchema } from "@aha.chat/flow-config"
import type { ModelMessage } from "ai"
import { maxConversationHistory } from "../automated-response/constants"

export async function buildAIMessages(
  conversation: ConversationModel,
  step: AIGenerateTextSchema,
): Promise<ModelMessage[]> {
  const messages: ModelMessage[] = []

  if (step.remember) {
    const lastMessages = await prisma.message.findMany({
      where: {
        conversationId: conversation.id,
        content: {
          not: null,
        },
        messageType: {
          in: [MessageType.incoming, MessageType.outgoing],
        },
      },
      orderBy: { createdAt: "desc" },
      take: maxConversationHistory,
    })

    for (const message of lastMessages) {
      if (!message.content) {
        continue
      }

      if (message.senderType === SenderType.contact) {
        messages.push({
          role: AIMessageRole.user,
          content: message.content,
        })
      } else {
        messages.push({
          role: AIMessageRole.assistant,
          content: message.content,
        })
      }
    }

    messages.reverse()
  }

  if (step.text) {
    messages.push({
      role: AIMessageRole.user,
      content: step.text,
    })
  }

  return messages
}
