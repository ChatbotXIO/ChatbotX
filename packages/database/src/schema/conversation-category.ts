import { integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { workspaceModel } from "./workspace"

/**
 * Categorias de fechamento de conversa (Closing Notes) — paridade Respond.io
 * Camada 2 (gap #15 — 2026-05-27).
 *
 * Admin gerencia em /settings/closing-notes. Atendente escolhe uma ao
 * encerrar conversa no Inbox (se closingNotesMode != disabled).
 */
export const conversationCategoryModel = pgTable(
  "ConversationCategory",
  {
    ...sharedColumns,
    name: text().notNull(),
    description: text(),
    position: integer().default(0).notNull(),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    uniqueIndex("ConversationCategory_workspaceId_name_key").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.name.asc().nullsLast(),
    ),
  ],
)
