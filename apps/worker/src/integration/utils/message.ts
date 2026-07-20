import { isImageUrl } from "@chatbotx.io/ai"
import { findOrFail } from "@chatbotx.io/database/client"
import { conversationModel } from "@chatbotx.io/database/schema"
import {
  type BotResponseTrackingContext,
  ChatJobAction,
  chatQueue,
  getRedisConnection,
  queueNames,
} from "@chatbotx.io/worker-config"
import { QueueEvents } from "bullmq"
import { env } from "../../env"
import { logger } from "../../lib/logger"

// Bound every chat-job wait. A stalled or backlogged chat worker used to leave
// job.waitUntilFinished() pending forever, and each pending wait keeps a
// QueueEvents listener plus its captured closures alive — the slow leak that
// OOM-crashed the integration worker. Validated + capped below the integration
// worker lockDuration in env.ts.
const CHAT_JOB_WAIT_TIMEOUT_MS = env.CHAT_JOB_WAIT_TIMEOUT_MS

let chatQueueEvents: QueueEvents | null = null

function getChatQueueEvents(): QueueEvents {
  if (chatQueueEvents) {
    return chatQueueEvents
  }

  chatQueueEvents = new QueueEvents(queueNames.enum.chat, {
    connection: getRedisConnection().duplicate(),
  })
  return chatQueueEvents
}

export async function closeChatQueueEvents(): Promise<void> {
  if (chatQueueEvents) {
    await chatQueueEvents.close()
    chatQueueEvents = null
  }
}

type SendMessageOptions = {
  forceUrl?: boolean
  storagePath?: string
}

async function enqueueChatMessage(
  conversationId: string,
  text: string,
  trackingContext?: BotResponseTrackingContext,
  options?: SendMessageOptions,
) {
  const shouldSendAsUrl = options?.forceUrl || isImageUrl(text)
  const data = shouldSendAsUrl
    ? {
        conversationId,
        url: text,
        storagePath: options?.storagePath,
        trackingContext,
      }
    : { conversationId, text, trackingContext }

  const conversation = await findOrFail({
    table: conversationModel,
    where: {
      id: conversationId,
    },
    message: "Conversation not found",
  })

  return chatQueue.add(ChatJobAction.sendChatMessage, {
    type: ChatJobAction.sendChatMessage,
    data: {
      ...data,
      conversation,
    },
  })
}

export function sendMessageWithRender(
  conversationId: string,
  text: string,
  trackingContext?: BotResponseTrackingContext,
  options?: SendMessageOptions,
) {
  return enqueueChatMessage(conversationId, text, trackingContext, options)
}

/**
 * Await a chat job's terminal state, bounded by CHAT_JOB_WAIT_TIMEOUT_MS.
 *
 * The chat message is already enqueued; this wait only preserves step ordering,
 * so a timeout or a job failure is logged and swallowed — never rethrown. If it
 * threw, the integration job would fail, BullMQ would retry it, and the message
 * could be sent twice. Bounding the wait also releases the QueueEvents listener
 * and its captured closures instead of leaking them when the chat worker stalls.
 */
async function awaitChatJob(
  job: Awaited<ReturnType<typeof chatQueue.add>>,
  context?: Record<string, unknown>,
): Promise<void> {
  if (!(typeof job === "object" && "waitUntilFinished" in job)) {
    return
  }

  try {
    await job.waitUntilFinished(getChatQueueEvents(), CHAT_JOB_WAIT_TIMEOUT_MS)
  } catch (err) {
    // A stalled chat worker surfaces here as a burst of these timeouts — the
    // real backlog signal. Swallowed so the flow still advances in order.
    logger.error(
      { ...context, err },
      "Chat job did not complete in time or failed; continuing flow",
    )
  }
}

/**
 * Block until an enqueued chat job reaches a terminal state, to preserve step
 * ordering. Bounded and non-throwing — see {@link awaitChatJob}.
 */
export async function waitForChatJobCompletion(
  job: Awaited<ReturnType<typeof chatQueue.add>>,
  context?: Record<string, unknown>,
): Promise<void> {
  await awaitChatJob(job, context)
}

export async function sendMessageAndWait(
  conversationId: string,
  text: string,
  trackingContext?: BotResponseTrackingContext,
  options?: SendMessageOptions,
): Promise<void> {
  const job = await enqueueChatMessage(
    conversationId,
    text,
    trackingContext,
    options,
  )

  await awaitChatJob(job, { conversationId })
}

export const normalizeEpochTimestamp = (value: unknown): Date | null => {
  if (value === null || value === undefined) {
    return null
  }

  const timestamp = Number(value)
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return null
  }

  const milliseconds = timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp
  const date = new Date(milliseconds)

  return Number.isNaN(date.getTime()) ? null : date
}
