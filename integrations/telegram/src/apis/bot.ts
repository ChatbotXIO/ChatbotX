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
} from "../schemas"

export const sendTelegramMessage = async (
  auth: TelegramAuthValue,
  payload: TelegramSendMessageRequest,
): Promise<void> => {
  const client = createTelegramClient(auth.secretText)
  await client.post<TelegramApiResponse<unknown>>("sendMessage", {
    json: payload,
  })
}

export const sendTelegramPhoto = async (
  auth: TelegramAuthValue,
  payload: TelegramSendPhotoRequest,
): Promise<void> => {
  const client = createTelegramClient(auth.secretText)
  await client.post<TelegramApiResponse<unknown>>("sendPhoto", {
    json: payload,
  })
}

export const sendTelegramDocument = async (
  auth: TelegramAuthValue,
  payload: TelegramSendDocumentRequest,
): Promise<void> => {
  const client = createTelegramClient(auth.secretText)
  await client.post<TelegramApiResponse<unknown>>("sendDocument", {
    json: payload,
  })
}

export const sendTelegramAudio = async (
  auth: TelegramAuthValue,
  payload: TelegramSendAudioRequest,
): Promise<void> => {
  const client = createTelegramClient(auth.secretText)
  await client.post<TelegramApiResponse<unknown>>("sendAudio", {
    json: payload,
  })
}

export const sendTelegramVideo = async (
  auth: TelegramAuthValue,
  payload: TelegramSendVideoRequest,
): Promise<void> => {
  const client = createTelegramClient(auth.secretText)
  await client.post<TelegramApiResponse<unknown>>("sendVideo", {
    json: payload,
  })
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

export type ConnectResult = {
  botId: string
  botUsername: string
  firstName: string
}

export const connect = async ({
  botToken,
}: {
  botToken: string
}): Promise<ConnectResult> => {
  const client = createTelegramClient(botToken)
  const response =
    await client.get<TelegramApiResponse<TelegramBotInfo>>("getMe")

  if (!response.ok) {
    throw new Error("Invalid bot token")
  }

  const { id, first_name, username } = response.result

  logger.debug(`Connected Telegram bot @${username} (id=${id})`)

  return {
    botId: String(id),
    botUsername: username ?? String(id),
    firstName: first_name,
  }
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
      return undefined
    }
    return `https://api.telegram.org/file/bot${auth.secretText}/${filePath}`
  } catch (error) {
    logger.error(error, "getTelegramFileUrl error")
    return undefined
  }
}
