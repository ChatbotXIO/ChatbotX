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
import { logger } from "../../lib/logger"

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
 * Block until an enqueued chat job processor reaches a terminal state.
 * This preserves step ordering; channel delivery failures may already be handled
 * inside the chat worker and may not surface here. Propagated failures are
 * logged with context and swallowed so the flow still advances in order.
 */
export async function waitForChatJobCompletion(
  job: Awaited<ReturnType<typeof chatQueue.add>>,
  context?: Record<string, unknown>,
): Promise<void> {
  if (!(typeof job === "object" && "waitUntilFinished" in job)) {
    return
  }

  try {
    await job.waitUntilFinished(getChatQueueEvents())
  } catch (err) {
    logger.error(
      { ...context, err },
      "Flow message chat job failed; continuing flow",
    )
  }
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

  if (typeof job === "object" && "waitUntilFinished" in job) {
    await job.waitUntilFinished(getChatQueueEvents())
  }
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
