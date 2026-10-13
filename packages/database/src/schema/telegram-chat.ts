import { index, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import {
  type TelegramBotChatStatus,
  type TelegramChatType,
  telegramBotChatStatuses,
  telegramChatTypes,
} from "../partials/telegram-chat"
import { inboxModel } from "./inbox"
import { workspaceModel } from "./workspace"

export const telegramChatType = pgEnum(
  "telegramChatType",
  telegramChatTypes.options as [TelegramChatType, ...TelegramChatType[]],
)

export const telegramBotChatStatus = pgEnum(
  "telegramBotChatStatus",
  telegramBotChatStatuses.options as [
    TelegramBotChatStatus,
    ...TelegramBotChatStatus[],
  ],
)

/**
 * Groups/channels a Telegram bot sits in, learned from `my_chat_member`
 * updates (Telegram has no API to list them). The leaderboard's group picker
 * reads it; `botStatus` is the bot's latest status there (administrator,
 * member, left, kicked…).
 */
export const telegramChatModel = pgTable(
  "TelegramChat",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    inboxId: bigintAsString()
      .notNull()
      .references(() => inboxModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    chatId: text().notNull(),
    title: text(),
    type: telegramChatType().notNull(),
    botStatus: telegramBotChatStatus().notNull(),
  },
  (table) => [
    uniqueIndex("TelegramChat_inboxId_chatId_key").using(
      "btree",
      table.inboxId.asc().nullsLast(),
      table.chatId.asc().nullsLast(),
    ),
    index("TelegramChat_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
  ],
)
