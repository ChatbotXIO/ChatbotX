import { aiContextStore, summarizeConversation } from "@chatbotx.io/ai/server"
import { db } from "@chatbotx.io/database/client"
import {
  AIJobAction,
  type AIJobSummarizeConversation,
  aiAgentQueue,
  aiJobSummarizeConversationDataSchema,
} from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"

const HISTORY_LIMIT = 20
const SUMMARY_BATCH_SIZE = 10

export async function handleSummarizeConversation(
  data: AIJobSummarizeConversation["data"],
) {
  const parsedData = aiJobSummarizeConversationDataSchema.safeParse(data)
  if (!parsedData.success) {
    logger.warn(
      { errors: parsedData.error.flatten(), data },
      "[summarizer-worker] Invalid summarize payload",
    )
    return
  }

  const { conversationId } = parsedData.data

  await aiContextStore
    .runExclusive(conversationId, async () => {
      const context = await aiContextStore.get(conversationId)
      if (!context) {
        return null
      }

      if (context.summarizing) {
        await aiContextStore.update(conversationId, {
          needsResummarize: true,
        })
        return null
      }

      if (context.history.length <= HISTORY_LIMIT) {
        if (context.needsResummarize || context.summarizing) {
          await aiContextStore.update(conversationId, {
            summarizing: false,
            needsResummarize: false,
          })
        }
        return null
      }

      const messagesToSummarize = context.history.slice(0, SUMMARY_BATCH_SIZE)
      if (messagesToSummarize.length === 0) {
        return null
      }

      await aiContextStore.update(conversationId, {
        summarizing: true,
        needsResummarize: false,
      })

      return {
        existingSummary: context.summary,
        messagesToSummarize,
      }
    })
    .then(async (snapshot) => {
      if (!snapshot) {
        return
      }

      const conversation = await db.query.conversationModel.findFirst({
        where: { id: conversationId },
      })

      if (!conversation) {
        await aiContextStore.update(conversationId, {
          summarizing: false,
        })
        return
      }

      const newSummary = await summarizeConversation({
        workspaceId: conversation.workspaceId,
        messages: snapshot.messagesToSummarize,
        existingSummary: snapshot.existingSummary,
      })

      let shouldRequeue = false
      await aiContextStore.runExclusive(conversationId, async () => {
        const latestContext = await aiContextStore.get(conversationId)
        if (!latestContext) {
          return
        }

        const consumed = Math.min(
          SUMMARY_BATCH_SIZE,
          latestContext.history.length,
        )
        const remainingHistory = latestContext.history.slice(consumed)

        shouldRequeue =
          latestContext.needsResummarize ||
          remainingHistory.length > HISTORY_LIMIT

        await aiContextStore.update(conversationId, {
          summary: newSummary,
          history: remainingHistory,
          summarizing: false,
          needsResummarize: false,
        })
      })

      if (shouldRequeue) {
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
        "[summarizer-worker] Failed to summarize conversation",
      )
      throw err // Rethrow for BullMQ retry
    })
}
