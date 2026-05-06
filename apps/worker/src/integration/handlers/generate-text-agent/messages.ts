import { MAX_CONVERSATION_HISTORY } from "@chatbotx.io/ai"
import { db } from "@chatbotx.io/database/client"
import { aiMessageRoles } from "@chatbotx.io/database/partials"
import type { ConversationModel } from "@chatbotx.io/database/types"
import type { AIGenerateTextAgentSchema } from "@chatbotx.io/flow-config"
import type { ModelMessage } from "ai"

export async function buildAIAgentMessages(
  conversation: ConversationModel,
  step: AIGenerateTextAgentSchema,
): Promise<ModelMessage[]> {
  const messages: ModelMessage[] = []

  if (step.rememberConversation) {
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
      limit: MAX_CONVERSATION_HISTORY,
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

  if (step.message) {
    messages.push({
      role: aiMessageRoles.enum.user,
      content: step.message,
    })
  }

  return messages
}
