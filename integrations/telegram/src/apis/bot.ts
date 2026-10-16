import { rescue, TelegramAPIException } from "../exception"
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
  TelegramSendMediaGroupRequest,
  TelegramSendMessageRequest,
  TelegramSendPhotoRequest,
  TelegramSendVideoRequest,
} from "../schema"

export const sendTelegramMessage = (
  auth: TelegramAuthValue,
  payload: TelegramSendMessageRequest,
): Promise<number> =>
  rescue("sendMessage", async () => {
    const client = createTelegramClient(auth.secretText)
    const response = await client.post<
      TelegramApiResponse<{ message_id: number }>
    >("sendMessage", { json: payload })
    return response.result.message_id
  })

export const sendTelegramPhoto = (
  auth: TelegramAuthValue,
  payload: TelegramSendPhotoRequest,
): Promise<number> =>
  rescue("sendPhoto", async () => {
    const client = createTelegramClient(auth.secretText)
    const response = await client.post<
      TelegramApiResponse<{ message_id: number }>
    >("sendPhoto", { json: payload })
    return response.result.message_id
  })

export const sendTelegramMediaGroup = (
  auth: TelegramAuthValue,
  payload: TelegramSendMediaGroupRequest,
): Promise<number[]> =>
  rescue("sendMediaGroup", async () => {
    const client = createTelegramClient(auth.secretText)
    const response = await client.post<
      TelegramApiResponse<Array<{ message_id: number }>>
    >("sendMediaGroup", { json: payload })
    return response.result.map((message) => message.message_id)
  })

export const sendTelegramDocument = (
  auth: TelegramAuthValue,
  payload: TelegramSendDocumentRequest,
): Promise<number> =>
  rescue("sendDocument", async () => {
    const client = createTelegramClient(auth.secretText)
    const response = await client.post<
      TelegramApiResponse<{ message_id: number }>
    >("sendDocument", { json: payload })
    return response.result.message_id
  })

export const sendTelegramAudio = (
  auth: TelegramAuthValue,
  payload: TelegramSendAudioRequest,
): Promise<number> =>
  rescue("sendAudio", async () => {
    const client = createTelegramClient(auth.secretText)
    const response = await client.post<
      TelegramApiResponse<{ message_id: number }>
    >("sendAudio", { json: payload })
    return response.result.message_id
  })

export const sendTelegramVideo = (
  auth: TelegramAuthValue,
  payload: TelegramSendVideoRequest,
): Promise<number> =>
  rescue("sendVideo", async () => {
    const client = createTelegramClient(auth.secretText)
    const response = await client.post<
      TelegramApiResponse<{ message_id: number }>
    >("sendVideo", { json: payload })
    return response.result.message_id
  })

export const sendChatAction = (
  auth: TelegramAuthValue,
  payload: TelegramSendChatActionRequest,
): Promise<void> =>
  rescue("sendChatAction", async () => {
    const client = createTelegramClient(auth.secretText)
    await client.post<TelegramApiResponse<unknown>>("sendChatAction", {
      json: payload,
    })
  })

export const answerCallbackQuery = (
  auth: TelegramAuthValue,
  callbackQueryId: string,
): Promise<void> =>
  rescue("answerCallbackQuery", async () => {
    const client = createTelegramClient(auth.secretText)
    await client.post<TelegramApiResponse<unknown>>("answerCallbackQuery", {
      json: { callback_query_id: callbackQueryId },
    })
  })

export const getMe = (auth: TelegramAuthValue): Promise<TelegramBotInfo> =>
  rescue("getMe", async () => {
    const client = createTelegramClient(auth.secretText)
    const response =
      await client.get<TelegramApiResponse<TelegramBotInfo>>("getMe")
    return response.result
  })

export const deleteWebhook = (botToken: string): Promise<void> =>
  rescue("deleteWebhook", async () => {
    const client = createTelegramClient(botToken)
    await client.post<TelegramApiResponse<boolean>>("deleteWebhook", {
      json: { drop_pending_updates: false },
    })
    logger.debug("Deleted Telegram webhook")
  })

/**
 * Update types the bot subscribes to. `chat_member` is NOT delivered unless
 * listed explicitly; `my_chat_member` tells us which groups/channels the bot
 * administers (the leaderboard's group picker). Bots connected before this
 * list existed keep their old subscription until the webhook is re-registered.
 */
export const TELEGRAM_ALLOWED_UPDATES = [
  "message",
  "callback_query",
  "my_chat_member",
  "chat_member",
] as const

export const setWebhook = (
  botToken: string,
  webhookUrl: string,
  secretToken?: string,
): Promise<void> =>
  rescue("setWebhook", async () => {
    const client = createTelegramClient(botToken)
    await client.post<TelegramApiResponse<boolean>>("setWebhook", {
      json: {
        url: webhookUrl,
        allowed_updates: TELEGRAM_ALLOWED_UPDATES,
        ...(secretToken ? { secret_token: secretToken } : {}),
      },
    })
  })

export const connect = ({
  botToken,
}: {
  botToken: string
}): Promise<TelegramBotInfo> =>
  rescue("getMe", async () => {
    const client = createTelegramClient(botToken)
    const response =
      await client.get<TelegramApiResponse<TelegramBotInfo>>("getMe")

    if (!response.ok) {
      throw new TelegramAPIException("Invalid bot token")
    }

    return response.result
  })

export const registerWebhook = ({
  botToken,
  webhookUrl,
  secretToken,
}: {
  botToken: string
  webhookUrl: string
  /** Echoed by Telegram in `X-Telegram-Bot-Api-Secret-Token`. */
  secretToken?: string
}): Promise<void> =>
  rescue("setWebhook", async () => {
    const client = createTelegramClient(botToken)
    await client.post<TelegramApiResponse<boolean>>("setWebhook", {
      json: {
        url: webhookUrl,
        allowed_updates: TELEGRAM_ALLOWED_UPDATES,
        ...(secretToken ? { secret_token: secretToken } : {}),
      },
    })
    logger.debug(`Registered Telegram webhook: ${webhookUrl}`)
  })

/** A user's membership status in a group/channel (`getChatMember`). */
export const getTelegramChatMemberStatus = (
  auth: TelegramAuthValue,
  props: { chatId: string; userId: string },
): Promise<{ status: string; isMember?: boolean }> =>
  rescue("getChatMember", async () => {
    const client = createTelegramClient(auth.secretText)
    const response = await client.get<
      TelegramApiResponse<{ status: string; is_member?: boolean }>
    >("getChatMember", {
      searchParams: { chat_id: props.chatId, user_id: props.userId },
    })
    return {
      status: response.result.status,
      isMember: response.result.is_member,
    }
  })

export const getTelegramFileUrl = async (
  auth: TelegramAuthValue,
  fileId: string,
): Promise<string | undefined> => {
  try {
    return await rescue("getFile", async () => {
      const client = createTelegramClient(auth.secretText)
      const response = await client.get<
        TelegramApiResponse<TelegramGetFileResponse>
      >("getFile", { searchParams: { file_id: fileId } })
      const filePath = response.result.file_path
      if (!filePath) {
        return
      }
      return `https://api.telegram.org/file/bot${auth.secretText}/${filePath}`
    })
  } catch (error) {
    if (error instanceof TelegramAPIException && error.httpStatusCode === 404) {
      return
    }
    throw error
  }
}
