import { db } from "@aha.chat/database/client"
import { AIMessageRole } from "@aha.chat/database/types"
import type { OutgoingConversation, OutgoingMessage } from "@aha.chat/sdk"
import type { ModelMessage } from "ai"
import { logger } from "../../../lib/logger"
import { getAIToolset } from "../generate-text/tools"
import { replyByAI, replyByAutomatedResponse } from "./replies"

export async function triggerAutomatedResponse({
  message,
}: {
  message: OutgoingMessage
}) {
  try {
    if (!message.content) {
      return
    }

    const conversation = await db.query.conversationModel.findFirst({
      where: { id: message.conversationId },
    })
    if (!conversation) {
      return
    }

    if (
      await replyByAutomatedResponse({
        message,
        conversation: conversation as OutgoingConversation,
      })
    ) {
      return
    }

    const aiAgent = await db.query.aiAgentModel.findFirst({
      where: {
        chatbotId: message.chatbotId,
        isDefault: true,
      },
    })
    if (!aiAgent) {
      return
    }

    const last100Messages = await db.query.messageModel.findMany({
      where: { conversationId: message.conversationId },
      orderBy: (table, { desc }) => [desc(table.createdAt)],
      limit: 100,
    })
    const lastAIMessages: ModelMessage[] = []
    for (const msg of last100Messages) {
      if (!msg.content) {
        continue
      }
      if (msg.senderType === "contact") {
        lastAIMessages.push({
          role: AIMessageRole.user,
          content: msg.content,
        })
      } else if (msg.senderType === "user" || msg.senderType === "bot") {
        lastAIMessages.push({ role: "assistant", content: msg.content })
      }
    }
    lastAIMessages.reverse()

    const toolset = await getAIToolset(aiAgent.chatbotId, aiAgent.tools)

    if (
      await replyByAI({
        message,
        conversation: conversation as OutgoingConversation,
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
  } catch (error) {
    logger.error(
      {
        error,
        conversationId: message.conversationId,
        chatbotId: message.chatbotId,
      },
      "[automated-response] triggerAutomatedResponse failed",
    )
    return
  }
}
