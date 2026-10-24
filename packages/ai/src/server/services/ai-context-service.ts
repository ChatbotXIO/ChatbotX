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
  MAX_CONVERSATION_HISTORY_HARD_CAP,
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

const dataUrlMediaTypePattern = /^data:([^;,]+)[;,]/

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

function toJsonSafeFileData(data: unknown, mediaType: string): string | null {
  if (typeof data === "string") {
    return data
  }
  if (data instanceof URL) {
    return data.toString()
  }
  if (data instanceof Buffer) {
    return `data:${mediaType};base64,${data.toString("base64")}`
  }
  if (data instanceof Uint8Array) {
    return `data:${mediaType};base64,${Buffer.from(data).toString("base64")}`
  }
  if (data instanceof ArrayBuffer) {
    return `data:${mediaType};base64,${Buffer.from(data).toString("base64")}`
  }
  return null
}

function mediaTypeFromData(data: string, fallback = "image/png"): string {
  const match = dataUrlMediaTypePattern.exec(data)
  return match?.[1] ?? fallback
}

type AIContentPart = Exclude<AIMessage["content"], string>[number]

// Cache entries written under v6 carry `image` parts; canonicalize them to the
// v7 `file` part while leaving text/file parts untouched.
function toModelUserPart(part: AIContentPart) {
  if (part.type === "image") {
    return {
      type: "file" as const,
      data: part.image,
      mediaType: part.mimeType ?? mediaTypeFromData(part.image),
    }
  }
  return part
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
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

export function isSameContextMessage(
  existing: AIMessage,
  incoming: AIMessage,
): boolean {
  // `seq` is assigned once, at append time, from a monotonic per-conversation
  // counter — it can never collide between two distinct history entries,
  // unlike `messageId`'s content-hash fallback below. Prefer it whenever both
  // sides already have one (i.e. both are stored history entries, not a
  // freshly-normalized incoming message still being deduped).
  if (existing.seq !== undefined && incoming.seq !== undefined) {
    return existing.seq === incoming.seq
  }

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

    if (message.role === "system") {
      // AI SDK v7 rejects system messages in `messages`. Instructions are
      // always passed at the top level, so never write new system entries.
      return null
    }

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

    const normalizedParts: Exclude<AIMessage["content"], string> = []

    const messageParts: unknown[] = message.content
    for (const part of messageParts) {
      if (!isRecord(part) || typeof part.type !== "string") {
        continue
      }

      if (part.type === "text" && typeof part.text === "string") {
        normalizedParts.push({ type: "text", text: part.text })
        continue
      }

      if (message.role !== "user") {
        continue
      }

      if (part.type === "file" && typeof part.mediaType === "string") {
        const data = toJsonSafeFileData(part.data, part.mediaType)
        if (data) {
          normalizedParts.push({
            type: "file",
            data,
            mediaType: part.mediaType,
          })
        }
        continue
      }

      // Redis entries written by v6 used `image`; preserve read compatibility
      // but canonicalize every new write to a v7 file part.
      if (part.type === "image") {
        const image = toJsonSafeFileData(part.image, "image/png")
        if (image) {
          normalizedParts.push({
            type: "file",
            data: image,
            mediaType:
              typeof part.mimeType === "string"
                ? part.mimeType
                : mediaTypeFromData(image),
          })
        }
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
    return history.flatMap((msg): ModelMessage[] => {
      switch (msg.role) {
        case "user":
          return [
            {
              role: "user",
              content:
                typeof msg.content === "string"
                  ? msg.content
                  : msg.content.map(toModelUserPart),
            },
          ]
        case "assistant":
          return [
            {
              role: "assistant",
              content: serializeMessageContent(msg.content),
            },
          ]
        // Instructions go through the top-level `instructions` option and
        // tool turns are not replayed from the cached context.
        case "system":
        case "tool":
          return []
        default: {
          const _exhaustive: never = msg.role
          return _exhaustive
        }
      }
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
          (context.markerMessageId !== conversation.aiContextLastMessageId ||
            context.history.some((message) => message.role === "system"))
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

          const aiHistoryUnseq = this.mapDbMessagesToContext(dbMessages)
          const aiHistory = aiHistoryUnseq.map((msg, index) => ({
            ...msg,
            seq: index,
          }))
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
            nextSeq: aiHistory.length,
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

        let nextSeq = context.nextSeq
        let hasNewHistory = false
        for (const msg of normalizedNewMessages) {
          const isDuplicate = currentHistory.some((h) =>
            isSameContextMessage(h, msg),
          )
          if (!isDuplicate) {
            hasNewHistory = true
            currentHistory.push({ ...msg, seq: nextSeq })
            nextSeq += 1
          }
        }

        if (!hasNewHistory) {
          return await aiContextStore.get(conversationId)
        }

        // Last-resort guard: cap history unconditionally, independent of
        // whether the summarize job (below) is healthy. If `summarizing` is
        // stuck (bug, race, Redis hiccup during reset), this is what actually
        // prevents unbounded prompt growth rather than just detecting it.
        // Applied before the summarize-trigger check below so that check
        // (and the persisted history) always agree on the same array.
        let boundedHistory = currentHistory
        if (currentHistory.length > MAX_CONVERSATION_HISTORY_HARD_CAP) {
          const droppedCount =
            currentHistory.length - MAX_CONVERSATION_HISTORY_HARD_CAP
          boundedHistory = currentHistory.slice(
            -MAX_CONVERSATION_HISTORY_HARD_CAP,
          )
          logger.error(
            {
              conversationId,
              historyLengthBeforeTruncate: currentHistory.length,
              hardCap: MAX_CONVERSATION_HISTORY_HARD_CAP,
              droppedCount,
            },
            "[ai-context-service] history exceeded hard cap — the summarizer safety net already failed; truncating to protect the AI prompt from unbounded growth",
          )
        }

        const shouldSummarize = boundedHistory.length > MAX_CONVERSATION_HISTORY
        const isSummarizing = context.summarizing === true

        if (shouldSummarize && isSummarizing) {
          logger.warn(
            {
              conversationId,
              historyLength: boundedHistory.length,
              maxConversationHistory: MAX_CONVERSATION_HISTORY,
            },
            "[ai-context-service] history exceeds cap while a summarize job is already marked in-flight — if this repeats across messages, the 'summarizing' flag is likely stuck and history is growing unbounded",
          )
        }

        await aiContextStore.update(conversationId, {
          history: boundedHistory,
          nextSeq,
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
