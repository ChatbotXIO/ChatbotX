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

export async function sendMessageWithRender(
  conversationId: string,
  text: string,
  trackingContext?: BotResponseTrackingContext,
  options?: SendMessageOptions,
): Promise<void> {
  await enqueueChatMessage(conversationId, text, trackingContext, options)
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
