import { pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { userModel } from "./auth-user"
import { conversationModel } from "./conversation"
import { conversationCategoryModel } from "./conversation-category"
import { workspaceModel } from "./workspace"

/**
 * Nota de fechamento da conversa (Closing Note) — paridade Respond.io
 * Camada 2 (gap #15 — 2026-05-27).
 *
 * 1-1 com Conversation: cada conversa fechada ganha (opcionalmente) uma
 * nota com categoria + summary. unique(conversationId) garante 1-1.
 *
 * categoryId e summary podem ser null dependendo do closingNotesMode do
 * workspace (disabled/optional/mandatoryDialog/mandatoryBoth).
 */
export const conversationClosingNoteModel = pgTable(
  "ConversationClosingNote",
  {
    ...sharedColumns,
    conversationId: bigintAsString()
      .notNull()
      .references(() => conversationModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    categoryId: bigintAsString().references(
      () => conversationCategoryModel.id,
      {
        onDelete: "set null",
        onUpdate: "cascade",
      },
    ),
    summary: text(),
    closedByUserId: bigintAsString().references(() => userModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    uniqueIndex("ConversationClosingNote_conversationId_key").using(
      "btree",
      table.conversationId.asc().nullsLast(),
    ),
  ],
)
