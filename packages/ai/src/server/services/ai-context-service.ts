import { createHash } from "node:crypto"
import { db } from "@chatbotx.io/database/client"
import { aiMessageRoles } from "@chatbotx.io/database/partials"
import { AIJobAction, aiAgentQueue } from "@chatbotx.io/worker-config"
import type { ModelMessage } from "ai"
import { logger } from "../../logger"
import { aiContextStore } from "../cache/ai-context-store"
import type { AIContext, AIMessage } from "../cache/schema"
import { summarizeConversation } from "./summarizer"

const HISTORY_LIMIT = 20

type DBConversationMessage = {
  id: string
  text: string | null
  senderType: string
  createdAt: Date
}

type ContextInputMessage = {
  message: ModelMessage
  messageId?: string
  createdAt?: number
}

function normalizeTimestamp(value?: number | Date): number | undefined {
  if (value instanceof Date) {
    return value.getTime()
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value)
  }

  return
}

function serializeMessageContent(content: AIMessage["content"]): string {
  return typeof content === "string" ? content : JSON.stringify(content)
}

function fallbackMessageId(props: {
  role: AIMessage["role"]
  content: AIMessage["content"]
  createdAt?: number
}): string {
  const content = serializeMessageContent(props.content)
  return createHash("sha256")
    .update(`${props.role}:${content}:${props.createdAt ?? 0}`)
    .digest("hex")
}

function isSameContextMessage(
  existing: AIMessage,
  incoming: AIMessage,
): boolean {
  if (existing.messageId && incoming.messageId) {
    return existing.messageId === incoming.messageId
  }

  return (
    existing.role === incoming.role &&
    existing.createdAt === incoming.createdAt &&
    serializeMessageContent(existing.content) ===
      serializeMessageContent(incoming.content)
  )
}

export const aiContextService = {
  /**
   * Map database messages to AI SDK ModelMessage format
   */
  mapMessages(dbMessages: Array<{ text: string | null; senderType: string }>) {
    const messages: ModelMessage[] = []
    for (const msg of dbMessages) {
      if (!msg.text) {
        continue
      }

      if (msg.senderType === "contact") {
        messages.push({
          role: aiMessageRoles.enum.user,
          content: msg.text,
        })
      } else if (msg.senderType === "user" || msg.senderType === "bot") {
        messages.push({
          role: aiMessageRoles.enum.assistant,
          content: msg.text,
        })
      }
    }
    return messages
  },

  mapMessagesForContext(dbMessages: DBConversationMessage[]): AIMessage[] {
    return dbMessages
      .flatMap((msg) => {
        if (!msg.text) {
          return []
        }

        if (
          msg.senderType !== "contact" &&
          msg.senderType !== "user" &&
          msg.senderType !== "bot"
        ) {
          return []
        }

        const role =
          msg.senderType === "contact"
            ? aiMessageRoles.enum.user
            : aiMessageRoles.enum.assistant

        const createdAt = normalizeTimestamp(msg.createdAt)
        const normalized = this.normalizeMessageForContext(
          {
            role,
            content: msg.text,
          },
          {
            messageId: msg.id,
            createdAt,
          },
        )

        return normalized ? [normalized] : []
      })
      .slice(-HISTORY_LIMIT)
  },

  mapContextToModelMessages(history: AIMessage[]): ModelMessage[] {
    const modelMessages: ModelMessage[] = []
    for (const message of history) {
      if (message.role === "tool") {
        continue
      }

      const content =
        typeof message.content === "string"
          ? message.content
          : JSON.stringify(message.content)

      if (message.role === "user") {
        modelMessages.push({
          role: "user",
          content,
        })
        continue
      }

      if (message.role === "assistant") {
        modelMessages.push({
          role: "assistant",
          content,
        })
        continue
      }

      modelMessages.push({
        role: "system",
        content,
      })
    }

    return modelMessages
  },

  normalizeMessageForContext(
    message: ModelMessage,
    metadata?: { messageId?: string; createdAt?: number | Date },
  ): AIMessage | null {
    const createdAt = normalizeTimestamp(metadata?.createdAt)
    const messageId = metadata?.messageId

    if (typeof message.content === "string") {
      const normalizedContent = message.content
      return {
        role: message.role,
        content: normalizedContent,
        messageId:
          messageId ??
          fallbackMessageId({
            role: message.role,
            content: normalizedContent,
            createdAt,
          }),
        createdAt,
      }
    }

    if (!Array.isArray(message.content)) {
      return null
    }

    const normalizedParts: Array<
      | { type: "text"; text: string }
      | {
          type: "image"
          image: string | Buffer | ArrayBuffer | URL
        }
    > = []

    for (const part of message.content) {
      if (part.type === "text") {
        normalizedParts.push({
          type: "text",
          text: part.text,
        })
        continue
      }

      if (part.type !== "image") {
        continue
      }

      const image =
        part.image instanceof Uint8Array && !(part.image instanceof Buffer)
          ? Buffer.from(part.image)
          : part.image

      if (
        typeof image === "string" ||
        image instanceof Buffer ||
        image instanceof ArrayBuffer ||
        image instanceof URL
      ) {
        normalizedParts.push({
          type: "image",
          image,
        })
      }
    }

    if (normalizedParts.length === 0) {
      return null
    }

    return {
      role: message.role,
      content: normalizedParts,
      messageId:
        messageId ??
        fallbackMessageId({
          role: message.role,
          content: normalizedParts,
          createdAt,
        }),
      createdAt,
    }
  },

  /**
   * Get AI context from cache or initialize it from DB
   */
  async getOrInitContext(props: {
    workspaceId: string
    conversationId: string
  }): Promise<AIContext | null> {
    const { workspaceId, conversationId } = props

    return await aiContextStore
      .runExclusive(conversationId, async () => {
        let context = await aiContextStore.get(conversationId)

        if (!context) {
          const last100Messages = await db.query.messageModel.findMany({
            where: { conversationId },
            orderBy: (table, { desc }) => [desc(table.createdAt)],
            limit: 100,
          })

          const dbMessages = [...last100Messages].reverse()
          const aiMessages = this.mapMessages(dbMessages)
          const aiHistory = this.mapMessagesForContext(dbMessages)

          const summary = await summarizeConversation({
            workspaceId,
            messages: aiMessages,
          })

          const nextContext = {
            summary,
            history: aiHistory,
            summarizing: false,
            needsResummarize: false,
          }
          context = {
            ...nextContext,
            updatedAt: Date.now(),
          }
          await aiContextStore.update(conversationId, nextContext)
        }

        return context
      })
      .catch((err) => {
        logger.error(
          { err, conversationId },
          "[ai-context-service] Failed to get or init AI context",
        )
        return null
      })
  },

  /**
   * Append new messages to history and update cache
   */
  async appendHistory(props: {
    conversationId: string
    newMessages: ContextInputMessage[]
  }): Promise<void> {
    const { conversationId, newMessages } = props

    await aiContextStore
      .runExclusive(conversationId, async () => {
        const context = await aiContextStore.get(conversationId)
        if (!context) {
          return
        }

        const currentHistory = [...context.history]

        const normalizedNewMessages = newMessages
          .map((entry) =>
            this.normalizeMessageForContext(entry.message, {
              messageId: entry.messageId,
              createdAt: entry.createdAt,
            }),
          )
          .filter((msg): msg is AIMessage => msg !== null)

        let hasNewHistory = false
        for (const msg of normalizedNewMessages) {
          const isDuplicate = currentHistory.some((h) =>
            isSameContextMessage(h, msg),
          )
          if (!isDuplicate) {
            hasNewHistory = true
            currentHistory.push(msg)
          }
        }

        if (!hasNewHistory) {
          return
        }

        const shouldSummarize = currentHistory.length > HISTORY_LIMIT
        const isSummarizing = context.summarizing === true

        await aiContextStore.update(conversationId, {
          history: currentHistory,
          needsResummarize: shouldSummarize && isSummarizing,
        })

        if (shouldSummarize && !isSummarizing) {
          await aiAgentQueue.add(
            AIJobAction.summarizeConversation,
            {
              type: AIJobAction.summarizeConversation,
              data: {
                conversationId,
              },
            },
            {
              jobId: `summarize:${conversationId}`,
              removeOnComplete: true,
              removeOnFail: true,
            },
          )
        }
      })
      .catch((err) => {
        logger.error(
          { err, conversationId },
          "[ai-context-service] Failed to append history",
        )
      })
  },
}
