import {
  type TelegramBotChatStatus,
  telegramBotChatStatuses,
  telegramChatTypes,
} from "@chatbotx.io/database/partials"
import { telegramChatRepository } from "@chatbotx.io/database/repositories"
import { logger } from "../logger"

/** Bot statuses that let it see members joining/leaving and group messages. */
const ADMIN_BOT_STATUSES: TelegramBotChatStatus[] = ["administrator", "creator"]

export type TelegramLeaderboardChat = {
  chatId: string
  title: string | null
  type: string
}

/**
 * Remembers the bot's latest status in a group/channel (from a
 * `my_chat_member` update). Telegram has no "list my chats" API, so this is
 * the only way the leaderboard can offer a group picker.
 */
export async function recordTelegramBotChatStatus(input: {
  workspaceId: string
  inboxId: string
  chat: { id: string; title?: string | null; type: string }
  status: string
}): Promise<void> {
  const type = telegramChatTypes.safeParse(input.chat.type)
  const status = telegramBotChatStatuses.safeParse(input.status)
  // A value Telegram adds later must not fail the webhook; just skip it.
  if (!(type.success && status.success)) {
    logger.warn(
      { chatType: input.chat.type, status: input.status },
      "unknown telegram chat type/status; not recorded",
    )
    return
  }
  await telegramChatRepository.upsert({
    workspaceId: input.workspaceId,
    inboxId: input.inboxId,
    chatId: input.chat.id,
    title: input.chat.title ?? null,
    type: type.data,
    botStatus: status.data,
  })
}

/**
 * Groups/channels where the inbox's bot is currently an admin — the choices
 * for a Telegram leaderboard's `scope.telegramChatIds`.
 */
export async function listTelegramLeaderboardChats(input: {
  workspaceId: string
  inboxId: string
}): Promise<TelegramLeaderboardChat[]> {
  const rows = await telegramChatRepository.listByInbox({
    workspaceId: input.workspaceId,
    inboxId: input.inboxId,
    botStatuses: ADMIN_BOT_STATUSES,
  })
  return rows.map((row) => ({
    chatId: row.chatId,
    title: row.title,
    type: row.type,
  }))
}
