import { createHash } from "node:crypto"
import { isMessageStorageError } from "@chatbotx.io/database/errors"
import {
  type AIAgentProviderModels,
  aiMessageRoles,
  senderTypes,
} from "@chatbotx.io/database/partials"
import {
  createMessageRepository,
  findConversationAIContextState,
  getSafeSinceTime,
} from "@chatbotx.io/database/repositories"
import { AIJobAction, aiAgentQueue } from "@chatbotx.io/worker-config"
import type { ModelMessage } from "ai"
import { normalizeError } from "universal-error-normalizer"
import {
  AI_MESSAGE_HISTORY_LOOKBACK_MS,
  MAX_CONVERSATION_HISTORY,
  MAX_SUMMARY_LENGTH,
} from "../../constants"
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
      { type: "text"; text: string } | { type: "image"; image: string }
    > = []

    for (const part of message.content) {
      if (part.type === "text") {
        normalizedParts.push({ type: "text", text: part.text })
        continue
      }

      if (part.type !== "image") {
        continue
      }

      const raw = part.image
      let imageStr: string

      if (typeof raw === "string") {
        imageStr = raw
      } else if (raw instanceof URL) {
        imageStr = raw.toString()
      } else if (raw instanceof Buffer) {
        imageStr = `data:image/png;base64,${raw.toString("base64")}`
      } else if (raw instanceof Uint8Array) {
        imageStr = `data:image/png;base64,${Buffer.from(raw).toString("base64")}`
      } else if (raw instanceof ArrayBuffer) {
        imageStr = `data:image/png;base64,${Buffer.from(raw).toString("base64")}`
      } else {
        continue
      }

      normalizedParts.push({ type: "image", image: imageStr })
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
    preferredModels?: AIAgentProviderModels
  }): Promise<AIContext | null> {
    const { workspaceId, conversationId, preferredModels } = props

    return await aiContextStore
      .runExclusive(conversationId, async () => {
        let context = await aiContextStore.get(conversationId)

        const conversation = await findConversationAIContextState({
          conversationId,
          workspaceId,
        })
        if (!conversation) {
          return null
        }

        if (
          context &&
          context.markerMessageId !== conversation.aiContextLastMessageId
        ) {
          await aiContextStore.delete(conversationId)
          context = null
        }

        if (!context) {
          const sinceTime =
            getSafeSinceTime(
              conversation.lastActivityAt,
              AI_MESSAGE_HISTORY_LOOKBACK_MS,
            ) ?? new Date(0)

          const repo = await createMessageRepository()
          const dbMessages = await repo.findAIContextMessages({
            conversationId,
            workspaceId,
            markerMessageId: conversation.aiContextLastMessageId,
            limit: MAX_CONVERSATION_HISTORY,
            sinceTime,
          })

          const aiHistory = this.mapDbMessagesToContext(dbMessages)
          const modelMessages = this.mapContextToModelMessages(aiHistory)

          const summary =
            modelMessages.length > 0
              ? await summarizeConversation({
                  workspaceId,
                  messages: modelMessages,
                  preferredModels,
                })
              : ""

          const nextContext = aiContextSchema.parse({
            markerMessageId: conversation.aiContextLastMessageId,
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
        const error = normalizeError(err)
        logger.error(
          {
            err: error,
            workspaceId,
            conversationId,
            action: "getOrInitContext",
          },
          "[ai-context-service] Failed to get or init AI context",
        )
        if (isMessageStorageError(err)) {
          throw err
        }
        return null
      })
  },

  /**
   * Append new messages to history and update cache.
   * Returns the updated AIContext, or null if context was not cached or no new messages were added.
   */
  async appendHistory(props: {
    conversationId: string
    newMessages: ContextInputMessage[]
  }): Promise<AIContext | null> {
    const { conversationId, newMessages } = props

    return await aiContextStore
      .runExclusive(conversationId, async () => {
        const context = await aiContextStore.get(conversationId)
        if (!context) {
          return null
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
          return await aiContextStore.get(conversationId)
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
              jobId: `summarize-${conversationId}`,
              removeOnComplete: true,
              removeOnFail: true,
            },
          )
        }

        return await aiContextStore.get(conversationId)
      })
      .catch((err) => {
        logger.error(
          { err, conversationId },
          "[ai-context-service] Failed to append history",
        )
        return null
      })
  },
}
