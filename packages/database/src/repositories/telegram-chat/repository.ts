import { createId } from "@chatbotx.io/utils"
import {
  and,
  asc,
  type DatabaseClient,
  db,
  eq,
  inArray,
  sql,
} from "../../client"
import type {
  TelegramBotChatStatus,
  TelegramChatType,
} from "../../partials/telegram-chat"
import { telegramChatModel } from "../../schema"
import type { TelegramChatModel } from "../../types"

export const telegramChatRepository = {
  /** Records the bot's latest status in a group/channel (one row per inbox + chat). */
  async upsert(
    input: {
      workspaceId: string
      inboxId: string
      chatId: string
      title: string | null
      type: TelegramChatType
      botStatus: TelegramBotChatStatus
    },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .insert(telegramChatModel)
      .values({ id: createId(), ...input })
      .onConflictDoUpdate({
        target: [telegramChatModel.inboxId, telegramChatModel.chatId],
        set: {
          // A status update without a title keeps the one we already know.
          title: sql`COALESCE(EXCLUDED.title, ${telegramChatModel.title})`,
          type: sql`EXCLUDED.type`,
          botStatus: sql`EXCLUDED."botStatus"`,
        },
      })
  },

  async listByInbox(
    input: {
      workspaceId: string
      inboxId: string
      botStatuses: TelegramBotChatStatus[]
    },
    tx: DatabaseClient = db,
  ): Promise<TelegramChatModel[]> {
    return await tx
      .select()
      .from(telegramChatModel)
      .where(
        and(
          eq(telegramChatModel.workspaceId, input.workspaceId),
          eq(telegramChatModel.inboxId, input.inboxId),
          inArray(telegramChatModel.botStatus, input.botStatuses),
        ),
      )
      .orderBy(asc(telegramChatModel.title))
  },
}
