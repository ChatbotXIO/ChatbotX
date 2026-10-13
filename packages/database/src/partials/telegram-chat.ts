import { z } from "zod"

/** Telegram `Chat.type` values a bot can be added to. */
export const telegramChatTypes = z.enum([
  "private",
  "group",
  "supergroup",
  "channel",
])
export type TelegramChatType = z.infer<typeof telegramChatTypes>

/** Telegram `ChatMember.status` values, as reported in `my_chat_member`. */
export const telegramBotChatStatuses = z.enum([
  "creator",
  "administrator",
  "member",
  "restricted",
  "left",
  "kicked",
])
export type TelegramBotChatStatus = z.infer<typeof telegramBotChatStatuses>
