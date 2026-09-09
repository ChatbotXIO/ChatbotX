import {
  type AIContext,
  type AIMessage,
  aiContextStore,
  isSameContextMessage,
  summarizeConversation,
} from "@chatbotx.io/ai/server"
import { conversationService } from "@chatbotx.io/business"
import {
  AIJobAction,
  type AIJobSummarizeConversation,
  aiAgentQueue,
  aiJobSummarizeConversationDataSchema,
} from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"

const HISTORY_LIMIT = 20
const SUMMARY_BATCH_SIZE = 10

// A healthy summarize call self-aborts within `aiTimeouts.aiStep` (60s, see
// packages/ai/src/constants/index.ts). If `summarizing` has been true for
// much longer than that, the job that set it almost certainly crashed
// (OOM/SIGKILL/redeploy) before it could reach its own `.then`/`.catch`
// reset — no code path is coming to clear the flag. Treat it as stale and
// self-heal instead of leaving it stuck forever.
const STALE_SUMMARIZING_THRESHOLD_MS = 5 * 60 * 1000

function removeSummarizedMessages(
  history: AIMessage[],
  messagesToSummarize: AIMessage[],
): AIMessage[] {
  const consumedSeqs = new Set<number>()
  const legacyConsumed: AIMessage[] = []
  for (const msg of messagesToSummarize) {
    if (msg.seq === undefined) {
      legacyConsumed.push(msg)
    } else {
      consumedSeqs.add(msg.seq)
    }
  }

  return history.filter((h) => {
    // Entries cached before `seq` existed (24h Redis TTL) — fall back to the
    // old identity check for just these stragglers.
    if (h.seq === undefined) {
      return !legacyConsumed.some((s) => isSameContextMessage(s, h))
    }
    return !consumedSeqs.has(h.seq)
  })
}

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
        const startedAt = context.summarizingStartedAt
        const staleForMs = startedAt === null ? null : Date.now() - startedAt
        const isStale =
          staleForMs !== null && staleForMs > STALE_SUMMARIZING_THRESHOLD_MS

        if (!isStale) {
          await aiContextStore.update(conversationId, {
            needsResummarize: true,
          })
          return null
        }

        // The job that set `summarizing: true` never reached its own
        // `.then`/`.catch` (worker crash, redeploy, OOM) — no other code path
        // will clear this flag. Recover by proceeding as if it were false.
        logger.warn(
          { conversationId, staleForMs },
          "[summarizer-worker] 'summarizing' flag stale for longer than a healthy summarize call can take — recovering from a likely crashed job",
        )
      }

      if (context.history.length <= HISTORY_LIMIT) {
        if (context.needsResummarize || context.summarizing) {
          await aiContextStore.update(conversationId, {
            summarizing: false,
            summarizingStartedAt: null,
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
        summarizingStartedAt: Date.now(),
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

      const conversation = await conversationService.findBy({
        where: { id: conversationId },
      })

      if (!conversation) {
        await aiContextStore.runExclusive(conversationId, async () => {
          await aiContextStore.update(conversationId, {
            summarizing: false,
            summarizingStartedAt: null,
          })
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

        // Filter by identity rather than slicing the first N entries: the
        // hard-cap truncation in appendHistory can drop messages from the
        // front of history while this summarize job is in flight, so the
        // current front-of-array entries are not reliably the ones that
        // were actually summarized.
        const remainingHistory = removeSummarizedMessages(
          latestContext.history,
          snapshot.messagesToSummarize,
        )

        shouldRequeue =
          latestContext.needsResummarize ||
          remainingHistory.length > HISTORY_LIMIT

        await aiContextStore.update(conversationId, {
          summary: newSummary,
          history: remainingHistory,
          summarizing: false,
          summarizingStartedAt: null,
          needsResummarize: false,
        })
      })

      if (shouldRequeue) {
        // The summary/history commit above already succeeded — a failure to
        // requeue must not be reported as "failed to summarize" nor trigger
        // a full BullMQ retry (which would redundantly re-run the AI
        // summarization call for work that's already done). It's safe to
        // just log and move on: `summarizing` is already `false`, so the
        // next `appendHistory` call past the threshold enqueues a fresh job
        // organically.
        await aiAgentQueue
          .add(
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
          .catch((requeueErr) => {
            logger.error(
              { err: requeueErr, conversationId },
              "[summarizer-worker] Failed to requeue follow-up summarize job after a successful summarize — will retry via next appendHistory trigger instead",
            )
          })
      }
    })
    .catch(async (err) => {
      // Never leave `summarizing` stuck true on a failed attempt — BullMQ
      // will retry this job from scratch, and if retries are exhausted the
      // flag must still be clear so the *next* appendHistory call is free to
      // enqueue a fresh summarize job. Without this, a permanently failing
      // summarize call (e.g. bad AI integration) permanently blocks
      // summarization and `history` grows unbounded.
      // Read-then-reset under the same lock as every other
      // summarizing/needsResummarize mutation, so the diagnostic snapshot
      // below reflects the state actually being reset, and neither can race
      // with a concurrent appendHistory reading a stale `summarizing` value.
      const contextSnapshotRef: { current: AIContext | null } = {
        current: null,
      }
      await aiContextStore
        .runExclusive(conversationId, async () => {
          contextSnapshotRef.current = await aiContextStore.get(conversationId)
          await aiContextStore.update(conversationId, {
            summarizing: false,
            summarizingStartedAt: null,
          })
        })
        .catch((resetErr) => {
          logger.error(
            { err: resetErr, conversationId },
            "[summarizer-worker] Failed to reset stuck 'summarizing' flag after summarize failure",
          )
        })

      logger.error(
        {
          err,
          conversationId,
          historyLengthAtFailure:
            contextSnapshotRef.current?.history.length ?? null,
          summarizingAtFailure: contextSnapshotRef.current?.summarizing ?? null,
        },
        "[summarizer-worker] Failed to summarize conversation",
      )
      throw err // Rethrow for BullMQ retry
    })
}
