import {
  type Context,
  contentTypes,
  guessFileTypeFromMimeType,
  type IncomingAttachment,
  type IncomingContact,
  type IncomingMessage,
  messageTypes,
  type ReceivedMessageResult,
} from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { getTelegramFileUrl } from "../../apis/bot"
import { TelegramException } from "../../exception"
import { logger } from "../../lib/logger"
import type {
  TelegramAuthValue,
  TelegramMessage,
  TelegramPhotoSize,
  TelegramUpdate,
} from "../../schema"
import { telegramUpdateSchema } from "../../schema"

export const receiveMessage = async ({
  ctx,
  data,
}: {
  ctx: Context<TelegramAuthValue>
  data: {
    integrationType: string
    integrationIdentifier: string
    payload: unknown
  }
}): Promise<ReceivedMessageResult> => {
  const update = telegramUpdateSchema.parse(data.payload)

  if (update.callback_query) {
    return receiveCallbackQuery(update)
  }

  if (!update.message) {
    throw new TelegramException("No message or callback_query in update")
  }

  return await getMessageResult(ctx, update.message)
}

const getMessageResult = async (
  ctx: Context<TelegramAuthValue>,
  message: TelegramMessage,
): Promise<ReceivedMessageResult> => {
  const contactId = String(message.from?.id ?? message.chat.id)

  const attachments = await getMessageAttachments(ctx, message)

  const incomingMessage: IncomingMessage = {
    sourceId: String(message.message_id),
    messageType: messageTypes.enum.incoming,
    text: message.text ?? message.caption,
    contentType: contentTypes.enum.text,
    attachments,
  }

  const contact: IncomingContact = {
    sourceId: contactId,
    firstName: message.from?.first_name,
    lastName: message.from?.last_name,
  }

  // Calculate ref from /start command
  let ref: string | null = null
  if (message.text?.startsWith("/start")) {
    ref = message.text.split(" ")[1]
  }

  return {
    message: incomingMessage,
    contact,
    postbackAction: null,
    quickReplyAction: null,
    ref,
  }
}

const receiveCallbackQuery = (
  update: TelegramUpdate,
): ReceivedMessageResult => {
  const callbackQuery = update.callback_query
  if (!callbackQuery) {
    throw new TelegramException("Missing callback_query")
  }

  const userId = callbackQuery.from.id
  const chatId = callbackQuery.message?.chat.id ?? userId
  const payload = callbackQuery.data ?? ""

  const incomingMessage: IncomingMessage = {
    sourceId: String(callbackQuery.id),
    messageType: messageTypes.enum.incoming,
    text: payload,
    contentType: contentTypes.enum.text,
    attachments: [],
  }

  const contact: IncomingContact = {
    sourceId: String(chatId),
    firstName: callbackQuery.from.first_name,
    lastName: callbackQuery.from.last_name,
  }

  return {
    message: incomingMessage,
    contact,
    postbackAction: payload,
    quickReplyAction: null,
    ref: null,
  }
}

const getMessageAttachments = async (
  ctx: Context<TelegramAuthValue>,
  message: TelegramMessage,
): Promise<IncomingAttachment[]> => {
  const attachments: IncomingAttachment[] = []

  if (message.photo) {
    const largestPhoto = getLargestPhoto(message.photo)
    if (largestPhoto) {
      const attachment = await downloadAndUploadFile(
        ctx,
        largestPhoto.file_id,
        "image/jpeg",
      )
      if (attachment) {
        attachments.push(attachment)
      }
    }
  }

  if (message.document) {
    const attachment = await downloadAndUploadFile(
      ctx,
      message.document.file_id,
      message.document.mime_type ?? "application/octet-stream",
    )
    if (attachment) {
      attachments.push(attachment)
    }
  }

  if (message.audio) {
    const attachment = await downloadAndUploadFile(
      ctx,
      message.audio.file_id,
      message.audio.mime_type ?? "audio/mpeg",
    )
    if (attachment) {
      attachments.push(attachment)
    }
  }

  if (message.video) {
    const attachment = await downloadAndUploadFile(
      ctx,
      message.video.file_id,
      message.video.mime_type ?? "video/mp4",
    )
    if (attachment) {
      attachments.push(attachment)
    }
  }

  if (message.voice) {
    const attachment = await downloadAndUploadFile(
      ctx,
      message.voice.file_id,
      message.voice.mime_type ?? "audio/ogg",
    )
    if (attachment) {
      attachments.push(attachment)
    }
  }

  return attachments
}

const downloadAndUploadFile = async (
  ctx: Context<TelegramAuthValue>,
  fileId: string,
  mimeType: string,
): Promise<IncomingAttachment | null> => {
  try {
    const fileUrl = await getTelegramFileUrl(ctx.auth, fileId)
    if (!fileUrl) {
      return null
    }

    const response = await fetch(fileUrl)
    if (!(response.ok && response.body)) {
      return null
    }

    const bytes = await response.arrayBuffer()
    const originPath = `${ctx.storagePrefix}/${createId()}`

    await ctx.uploader?.putObject(originPath, Buffer.from(bytes), {
      ACL: "public-read",
      ContentType: mimeType,
    })

    return {
      sourceId: createId(),
      originPath,
      fileType: guessFileTypeFromMimeType(mimeType),
      mimeType,
      size: bytes.byteLength,
    }
  } catch (error) {
    logger.error(error, "downloadAndUploadFile error")
    return null
  }
}

const getLargestPhoto = (
  photos: TelegramPhotoSize[],
): TelegramPhotoSize | undefined =>
  photos.reduce<TelegramPhotoSize | undefined>((largest, photo) => {
    if (!largest) {
      return photo
    }
    return photo.file_size &&
      largest.file_size &&
      photo.file_size > largest.file_size
      ? photo
      : largest
  }, undefined)
