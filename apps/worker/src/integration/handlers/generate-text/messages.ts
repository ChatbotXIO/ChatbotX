import { db } from "@aha.chat/database/client"
import { aiMessageRoles } from "@aha.chat/database/schema"
import type { ConversationModel } from "@aha.chat/database/types"
import type { AIGenerateTextSchema } from "@aha.chat/flow-config"
import type { ModelMessage } from "ai"
import { maxConversationHistory } from "../automated-response/constants"

export async function buildAIMessages(
  conversation: ConversationModel,
  step: AIGenerateTextSchema,
): Promise<ModelMessage[]> {
  const messages: ModelMessage[] = []

  if (step.remember) {
    const lastMessages = await db.query.messageModel.findMany({
      where: {
        conversationId: conversation.id,
        text: {
          isNotNull: true,
        },
        messageType: {
          in: ["incoming", "outgoing"],
        },
      },
      orderBy: { createdAt: "desc" },
      limit: maxConversationHistory,
    })

    for (const message of lastMessages) {
      if (!message.text) {
        continue
      }

      if (message.senderType === "contact") {
        messages.push({
          role: aiMessageRoles.enum.user,
          content: message.text,
        })
      } else {
        messages.push({
          role: aiMessageRoles.enum.assistant,
          content: message.text,
        })
      }
    }

    messages.reverse()
  }

  if (step.text) {
    messages.push({
      role: aiMessageRoles.enum.user,
      content: step.text,
    })
  }

  return messages
}
