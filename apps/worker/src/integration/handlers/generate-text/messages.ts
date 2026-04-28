import { MAX_CONVERSATION_HISTORY } from "@chatbotx.io/ai"
import { aiMessageRoles } from "@chatbotx.io/database/partials"
import {
  createMessageRepository,
  getSafeSinceTime,
} from "@chatbotx.io/database/repositories"
import type {
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import type { AIGenerateTextSchema } from "@chatbotx.io/flow-config"
import type { ModelMessage } from "ai"

export async function buildAIMessages(
  conversation: ConversationModel,
  contactInbox: ContactInboxModel,
  step: AIGenerateTextSchema,
): Promise<ModelMessage[]> {
  const messages: ModelMessage[] = []

  if (step.remember) {
    const messageRepository = await createMessageRepository()
    const lastMessages = await messageRepository.findManyByConversation(
      conversation.id,
      {
        limit: MAX_CONVERSATION_HISTORY,
        messageTypes: ["incoming", "outgoing"],
        textNotNull: true,
        sinceTime: getSafeSinceTime(
          contactInbox.lastMessageAt,
          365 * 24 * 60 * 60 * 1000, // 1 year
        ),
      },
    )

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
