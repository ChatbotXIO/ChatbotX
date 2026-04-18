import { createTelegramClient } from "../lib/http-client"
import { logger } from "../lib/logger"
import type {
  TelegramApiResponse,
  TelegramAuthValue,
  TelegramBotInfo,
  TelegramGetFileResponse,
  TelegramSendAudioRequest,
  TelegramSendChatActionRequest,
  TelegramSendDocumentRequest,
  TelegramSendMessageRequest,
  TelegramSendPhotoRequest,
  TelegramSendVideoRequest,
} from "../schema"

export const sendTelegramMessage = async (
  auth: TelegramAuthValue,
  payload: TelegramSendMessageRequest,
): Promise<number> => {
  const client = createTelegramClient(auth.secretText)
  const response = await client.post<
    TelegramApiResponse<{ message_id: number }>
  >("sendMessage", {
    json: payload,
  })
  return response.result.message_id
}

export const sendTelegramPhoto = async (
  auth: TelegramAuthValue,
  payload: TelegramSendPhotoRequest,
): Promise<number> => {
  const client = createTelegramClient(auth.secretText)
  const response = await client.post<
    TelegramApiResponse<{ message_id: number }>
  >("sendPhoto", {
    json: payload,
  })
  return response.result.message_id
}

export const sendTelegramDocument = async (
  auth: TelegramAuthValue,
  payload: TelegramSendDocumentRequest,
): Promise<number> => {
  const client = createTelegramClient(auth.secretText)
  const response = await client.post<
    TelegramApiResponse<{ message_id: number }>
  >("sendDocument", {
    json: payload,
  })
  return response.result.message_id
}

export const sendTelegramAudio = async (
  auth: TelegramAuthValue,
  payload: TelegramSendAudioRequest,
): Promise<number> => {
  const client = createTelegramClient(auth.secretText)
  const response = await client.post<
    TelegramApiResponse<{ message_id: number }>
  >("sendAudio", {
    json: payload,
  })
  return response.result.message_id
}

export const sendTelegramVideo = async (
  auth: TelegramAuthValue,
  payload: TelegramSendVideoRequest,
): Promise<number> => {
  const client = createTelegramClient(auth.secretText)
  const response = await client.post<
    TelegramApiResponse<{ message_id: number }>
  >("sendVideo", {
    json: payload,
  })
  return response.result.message_id
}

export const sendChatAction = async (
  auth: TelegramAuthValue,
  payload: TelegramSendChatActionRequest,
): Promise<void> => {
  const client = createTelegramClient(auth.secretText)
  await client.post<TelegramApiResponse<unknown>>("sendChatAction", {
    json: payload,
  })
}

export const answerCallbackQuery = async (
  auth: TelegramAuthValue,
  callbackQueryId: string,
): Promise<void> => {
  const client = createTelegramClient(auth.secretText)
  await client.post<TelegramApiResponse<unknown>>("answerCallbackQuery", {
    json: { callback_query_id: callbackQueryId },
  })
}

export const getMe = async (
  auth: TelegramAuthValue,
): Promise<TelegramBotInfo> => {
  const client = createTelegramClient(auth.secretText)
  const response =
    await client.get<TelegramApiResponse<TelegramBotInfo>>("getMe")
  return response.result
}

export const deleteWebhook = async (botToken: string): Promise<void> => {
  const client = createTelegramClient(botToken)
  await client.post<TelegramApiResponse<boolean>>("deleteWebhook", {
    json: { drop_pending_updates: false },
  })

  logger.debug("Deleted Telegram webhook")
}

export const setWebhook = async (
  botToken: string,
  webhookUrl: string,
  secretToken?: string,
): Promise<void> => {
  const client = createTelegramClient(botToken)
  await client.post<TelegramApiResponse<boolean>>("setWebhook", {
    json: {
      url: webhookUrl,
      ...(secretToken ? { secret_token: secretToken } : {}),
    },
  })
}

export const connect = async ({
  botToken,
}: {
  botToken: string
}): Promise<TelegramBotInfo> => {
  const client = createTelegramClient(botToken)
  const response =
    await client.get<TelegramApiResponse<TelegramBotInfo>>("getMe")

  if (!response.ok) {
    throw new Error("Invalid bot token")
  }

  return response.result
}

export const registerWebhook = async ({
  botToken,
  webhookUrl,
}: {
  botToken: string
  webhookUrl: string
}): Promise<void> => {
  const client = createTelegramClient(botToken)
  await client.post<TelegramApiResponse<boolean>>("setWebhook", {
    json: { url: webhookUrl },
  })

  logger.debug(`Registered Telegram webhook: ${webhookUrl}`)
}

export const getTelegramFileUrl = async (
  auth: TelegramAuthValue,
  fileId: string,
): Promise<string | undefined> => {
  const client = createTelegramClient(auth.secretText)
  try {
    const response = await client.get<
      TelegramApiResponse<TelegramGetFileResponse>
    >("getFile", { searchParams: { file_id: fileId } })
    const filePath = response.result.file_path
    if (!filePath) {
      return
    }
    return `https://api.telegram.org/file/bot${auth.secretText}/${filePath}`
  } catch (error) {
    logger.error(error, "getTelegramFileUrl error")
    return
  }
}
