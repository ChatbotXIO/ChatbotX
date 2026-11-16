import {
  type Context,
  contentTypes,
  EXTENSION_MIME_TYPES,
  getMediaStoragePrefix,
  type IncomingAttachment,
  type IncomingFileType,
  type IncomingMessage,
  messageTypes,
  type ReceivedMessageResult,
} from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import {
  storeIncomingImage,
  toStoredMediaFields,
} from "@chatbotx.io/utils/store-incoming-image"
import { lineFetch } from "../../apis/client"
import { LineException } from "../../exception"
import { logger } from "../../lib/logger"
import type { LineAuthValue } from "../../schema"
import {
  type LineWebhookEvent,
  lineWebhookEventSchema,
} from "../../schema/webhook"

/**
 * Postback data of the "-" padding buttons that evened out carousel template
 * columns. Exists only for messages sent before the switch to Flex Messages
 * (nothing sends it any more): users can still tap those buttons in old
 * chats, and the tap is dropped so it never reaches the inbox or a flow.
 */
export const LINE_NOOP_POSTBACK_DATA = "line:noop"

/**
 * How long a stashed reply token is tried before falling back to push.
 * LINE documents no fixed lifetime; replies were accepted >= 10 min after the
 * user's message in live testing on 2026-11-10. An expired token falls back
 * to push immediately.
 */
const REPLY_TOKEN_TTL_SECONDS = 300

export const replyTokenKey = (userId: string): string => `replyToken:${userId}`

type LineMessage = NonNullable<LineWebhookEvent["message"]>

const mimeFromName = (name: string | undefined): string | undefined => {
  const ext = name?.split(".").pop()?.toLowerCase()
  return ext ? EXTENSION_MIME_TYPES[ext] : undefined
}

// The content endpoint is fetched as raw bytes (no headers), so the type is
// derived from the LINE message type, sniffing the image magic bytes.
const sniffImageMime = (bytes: ArrayBuffer): string => {
  const head = new Uint8Array(bytes.slice(0, 4))
  if (head[0] === 0x89 && head[1] === 0x50) {
    return "image/png"
  }
  if (head[0] === 0x47 && head[1] === 0x49) {
    return "image/gif"
  }
  return "image/jpeg"
}

export const receiveMessage = async ({
  ctx,
  data,
}: {
  ctx: Context<LineAuthValue>
  data: {
    integrationType: string
    integrationIdentifier: string
    payload: unknown
  }
}): Promise<ReceivedMessageResult | null> => {
  const event = lineWebhookEventSchema.parse(data.payload)
  const userId = event.source?.userId
  if (!userId) {
    throw new LineException("LINE event has no user source")
  }

  await stashReplyToken(ctx, event, userId)
  // LINE's own event time for the message.
  const occurredAt = lineEventTime(event.timestamp)

  if (event.postback?.data === LINE_NOOP_POSTBACK_DATA) {
    // A tap on a pre-Flex carousel padding button: nothing to route.
    return null
  }

  if (event.type === "postback" && event.postback) {
    return {
      message: {
        sourceId: event.webhookEventId ?? createId(),
        messageType: messageTypes.enum.incoming,
        text: event.postback.data,
        contentType: contentTypes.enum.text,
        attachments: [],
      },
      contact: { sourceId: userId },
      postbackAction: event.postback.data,
      quickReplyAction: null,
      ref: null,
      occurredAt,
    }
  }

  if (event.type !== "message" || !event.message) {
    throw new LineException(`Unsupported LINE event type: ${event.type}`)
  }

  const message = await toIncomingMessage(ctx, event.message)
  return {
    message,
    contact: { sourceId: userId },
    postbackAction: null,
    quickReplyAction: null,
    ref: null,
    occurredAt,
  }
}

const lineEventTime = (timestamp: number | undefined): Date | null =>
  typeof timestamp === "number" && Number.isFinite(timestamp) && timestamp > 0
    ? new Date(timestamp)
    : null

const stashReplyToken = async (
  ctx: Context<LineAuthValue>,
  event: LineWebhookEvent,
  userId: string,
): Promise<void> => {
  // A redelivered event carries a token that has most likely expired.
  if (!event.replyToken || event.deliveryContext?.isRedelivery) {
    return
  }
  try {
    await ctx.ephemeral?.put(
      replyTokenKey(userId),
      event.replyToken,
      REPLY_TOKEN_TTL_SECONDS,
    )
  } catch (error) {
    // Best effort: without the token the reply is pushed instead, but the
    // inbound message itself must never be dropped over a Redis failure.
    logger.warn({ err: error }, "LINE reply token stash failed")
  }
}

const toIncomingMessage = async (
  ctx: Context<LineAuthValue>,
  message: LineMessage,
): Promise<IncomingMessage> => {
  const base = {
    sourceId: message.id ?? createId(),
    messageType: messageTypes.enum.incoming,
    attachments: [] as IncomingAttachment[],
  }

  switch (message.type) {
    case "text":
      return {
        ...base,
        contentType: contentTypes.enum.text,
        text: stringField(message, "text"),
      }
    case "location": {
      const title = stringField(message, "title") ?? ""
      const address = stringField(message, "address") ?? ""
      const latitude = String(message.latitude)
      const longitude = String(message.longitude)
      return {
        ...base,
        contentType: contentTypes.enum.location,
        text: `${title} ${address} (${latitude},${longitude})`.trim(),
        contentAttributes: { latitude, longitude },
      }
    }
    case "sticker":
      return {
        ...base,
        contentType: contentTypes.enum.text,
        text: `[sticker ${message.packageId}/${message.stickerId}]`,
      }
    case "image":
    case "video":
    case "audio":
    case "file": {
      const attachment = await getAttachment(ctx, message)
      return {
        ...base,
        contentType: contentTypes.enum.text,
        attachments: [attachment],
      }
    }
    default:
      return {
        ...base,
        contentType: contentTypes.enum.text,
        text: `[${message.type}]`,
      }
  }
}

const stringField = (message: LineMessage, key: string): string | undefined => {
  const value = message[key]
  return typeof value === "string" ? value : undefined
}

const getAttachment = async (
  ctx: Context<LineAuthValue>,
  message: LineMessage,
): Promise<IncomingAttachment> => {
  const fileType = (
    message.type === "file" ? "file" : message.type
  ) as IncomingFileType
  const name = stringField(message, "fileName")
  const provider = message.contentProvider as
    | { type?: string; originalContentUrl?: string }
    | undefined

  if (provider?.type === "external" && provider.originalContentUrl) {
    const url = provider.originalContentUrl
    return {
      sourceId: message.id ?? url,
      fileType,
      mimeType: mimeFromName(url) ?? defaultMime(fileType),
      originPath: url,
      size: 0,
      url,
    }
  }

  try {
    const bytes = await lineFetch<ArrayBuffer>(ctx.auth, {
      method: "GET",
      path: `/v2/bot/message/${message.id}/content`,
      host: "data",
      raw: true,
    })
    const mimeType =
      fileType === "image"
        ? sniffImageMime(bytes)
        : (mimeFromName(name) ?? defaultMime(fileType))

    const stored = await storeIncomingImage({
      uploader: ctx.uploader,
      key: `${getMediaStoragePrefix(ctx)}/${createId()}`,
      bytes,
      mimeType,
      // Only a photo message is re-encoded; everything else keeps its bytes.
      profile: fileType === "image" ? "media" : "original",
      acl: "public-read",
    })

    return {
      sourceId: message.id ?? createId(),
      fileType,
      ...(name ? { name } : {}),
      ...(fileType === "image" ? { isPhotoMessage: true } : {}),
      ...toStoredMediaFields(stored),
    }
  } catch (error) {
    logger.error(
      { err: error, messageId: message.id },
      "LINE media download failed",
    )
    throw error
  }
}

const defaultMime = (fileType: IncomingFileType): string => {
  switch (fileType) {
    case "image":
      return "image/jpeg"
    case "video":
      return "video/mp4"
    case "audio":
      return "audio/mp4"
    default:
      return "application/octet-stream"
  }
}
