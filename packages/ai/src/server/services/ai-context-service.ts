import { createHash } from "node:crypto"
import { db } from "@chatbotx.io/database/client"
import { aiMessageRoles, senderTypes } from "@chatbotx.io/database/partials"
import { AIJobAction, aiAgentQueue } from "@chatbotx.io/worker-config"
import type { ModelMessage } from "ai"
import { MAX_CONVERSATION_HISTORY, MAX_SUMMARY_LENGTH } from "../../constants"
import { logger } from "../../logger"
import { aiContextStore } from "../cache/ai-context-store"
import {
  type AIContext,
  type AIMessage,
  aiContextSchema,
} from "../cache/schema"
import { summarizeConversation } from "./summarizer"

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
   * Normalize any message format to AIMessage for context storage
   */
  normalizeMessageForContext(
    message: ModelMessage,
    metadata?: { messageId?: string; createdAt?: number | Date },
  ): AIMessage | null {
    const createdAt = normalizeTimestamp(metadata?.createdAt)
    const messageId = metadata?.messageId

    if (typeof message.content === "string") {
      const normalizedContent = message.content
      return {
        role: message.role as AIMessage["role"],
        content: normalizedContent,
        messageId:
          messageId ??
          fallbackMessageId({
            role: message.role as AIMessage["role"],
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
      role: message.role as AIMessage["role"],
      content: normalizedParts,
      messageId:
        messageId ??
        fallbackMessageId({
          role: message.role as AIMessage["role"],
          content: normalizedParts,
          createdAt,
        }),
      createdAt,
    }
  },

  /**
   * Map database messages to AIMessage format for context
   */
  mapDbMessagesToContext(dbMessages: DBConversationMessage[]): AIMessage[] {
    return dbMessages
      .flatMap((msg) => {
        if (!msg.text) {
          return []
        }

        const senderTypeResult = senderTypes.safeParse(msg.senderType)
        if (!senderTypeResult.success) {
          return []
        }

        const role =
          senderTypeResult.data === "contact"
            ? aiMessageRoles.enum.user
            : aiMessageRoles.enum.assistant

        const normalized = this.normalizeMessageForContext(
          {
            role,
            content: msg.text,
          },
          {
            messageId: msg.id,
            createdAt: msg.createdAt,
          },
        )

        return normalized ? [normalized] : []
      })
      .slice(-MAX_CONVERSATION_HISTORY)
  },

  /**
   * Map AIMessage (context format) to ModelMessage (AI SDK format)
   */
  mapContextToModelMessages(history: AIMessage[]): ModelMessage[] {
    return history
      .filter((msg) => msg.role !== "tool")
      .map((msg) => {
        const content = serializeMessageContent(msg.content)
        if (msg.role === "user") {
          return { role: "user", content }
        }
        if (msg.role === "assistant") {
          return { role: "assistant", content }
        }
        return { role: "system", content }
      })
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
          const lastMessages = await db.query.messageModel.findMany({
            where: { conversationId },
            orderBy: (table, { desc }) => [desc(table.createdAt)],
            limit: MAX_CONVERSATION_HISTORY,
          })

          const dbMessages = [...lastMessages].reverse()
          const aiHistory = this.mapDbMessagesToContext(dbMessages)
          const modelMessages = this.mapContextToModelMessages(aiHistory)

          const summary = await summarizeConversation({
            workspaceId,
            messages: modelMessages,
          })

          const nextContext = aiContextSchema.parse({
            summary: summary.slice(0, MAX_SUMMARY_LENGTH),
            history: aiHistory,
            summarizing: false,
            needsResummarize: false,
            updatedAt: Date.now(),
          })

          await aiContextStore.update(conversationId, nextContext)
          context = nextContext
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

        const shouldSummarize = currentHistory.length > MAX_CONVERSATION_HISTORY
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
