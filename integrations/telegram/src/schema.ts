import type { BaseConfig, SecretTextAuthValue } from "@chatbotx.io/sdk"
import { z } from "zod"

export type TelegramConfig = BaseConfig & {
  webhookSecretToken?: string
  botId?: string
  stateParams?: {
    workspaceId: string
  }
}

export type TelegramAuthValue = SecretTextAuthValue

export type TelegramActions = {
  connect: (props: { botToken: string }) => Promise<{
    id: string
    username: string
  }>
  registerWebhook: (props: {
    botToken: string
    webhookUrl: string
  }) => Promise<void>
}

// ─── Telegram entity schemas ─────────────────────────────────────────────────

export const telegramUserSchema = z.object({
  id: z.number(),
  is_bot: z.boolean(),
  first_name: z.string(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  language_code: z.string().optional(),
})
export type TelegramUser = z.infer<typeof telegramUserSchema>

export const telegramChatSchema = z.object({
  id: z.number(),
  type: z.enum(["private", "group", "supergroup", "channel"]).or(z.string()),
  title: z.string().optional(),
  username: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
})
export type TelegramChat = z.infer<typeof telegramChatSchema>

export const telegramPhotoSizeSchema = z.object({
  file_id: z.string(),
  file_unique_id: z.string(),
  width: z.number(),
  height: z.number(),
  file_size: z.number().optional(),
})
export type TelegramPhotoSize = z.infer<typeof telegramPhotoSizeSchema>

export const telegramFileSchema = z.object({
  file_id: z.string(),
  file_unique_id: z.string(),
  file_size: z.number().optional(),
  file_name: z.string().optional(),
  mime_type: z.string().optional(),
})
export type TelegramFile = z.infer<typeof telegramFileSchema>

export const telegramStickerSchema = z.object({
  file_id: z.string(),
  file_unique_id: z.string(),
  width: z.number(),
  height: z.number(),
})
export type TelegramSticker = z.infer<typeof telegramStickerSchema>

export const telegramMessageSchema = z.object({
  message_id: z.number(),
  from: telegramUserSchema.optional(),
  chat: telegramChatSchema,
  date: z.number(),
  text: z.string().optional(),
  caption: z.string().optional(),
  photo: z.array(telegramPhotoSizeSchema).optional(),
  document: telegramFileSchema.optional(),
  audio: telegramFileSchema.optional(),
  video: telegramFileSchema.optional(),
  voice: telegramFileSchema.optional(),
  sticker: telegramStickerSchema.optional(),
})
export type TelegramMessage = z.infer<typeof telegramMessageSchema>

export const telegramCallbackQuerySchema = z.object({
  id: z.string(),
  from: telegramUserSchema,
  message: telegramMessageSchema.optional(),
  data: z.string().optional(),
})
export type TelegramCallbackQuery = z.infer<typeof telegramCallbackQuerySchema>

export const telegramUpdateSchema = z.object({
  update_id: z.number(),
  message: telegramMessageSchema.optional(),
  callback_query: telegramCallbackQuerySchema.optional(),
})
export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>

// ─── Outgoing message types ───────────────────────────────────────────────────

export type TelegramInlineKeyboardButton = {
  text: string
  callback_data?: string
  url?: string
}

export type TelegramInlineKeyboardMarkup = {
  inline_keyboard: TelegramInlineKeyboardButton[][]
}

export type TelegramSendMessageRequest = {
  chat_id: number | string
  text: string
  parse_mode?: "HTML" | "Markdown" | "MarkdownV2"
  reply_markup?: TelegramInlineKeyboardMarkup
}

export type TelegramSendPhotoRequest = {
  chat_id: number | string
  photo: string
  caption?: string
  parse_mode?: "HTML" | "Markdown" | "MarkdownV2"
  reply_markup?: TelegramInlineKeyboardMarkup
}

export type TelegramSendDocumentRequest = {
  chat_id: number | string
  document: string
  caption?: string
  reply_markup?: TelegramInlineKeyboardMarkup
}

export type TelegramSendAudioRequest = {
  chat_id: number | string
  audio: string
  caption?: string
  reply_markup?: TelegramInlineKeyboardMarkup
}

export type TelegramSendVideoRequest = {
  chat_id: number | string
  video: string
  caption?: string
  reply_markup?: TelegramInlineKeyboardMarkup
}

export type TelegramSendChatActionRequest = {
  chat_id: number | string
  action:
    | "typing"
    | "upload_photo"
    | "record_video"
    | "upload_video"
    | "upload_document"
}

export type TelegramApiResponse<T> = {
  ok: boolean
  result: T
}

export type TelegramBotInfo = {
  id: number
  first_name: string
  username?: string
}

export type TelegramGetFileResponse = {
  file_id: string
  file_unique_id: string
  file_size?: number
  file_path?: string
}
