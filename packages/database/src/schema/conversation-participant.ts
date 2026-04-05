import { index, pgTable, uniqueIndex } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { userModel } from "./auth-user"
import { conversationModel } from "./conversation"
import { workspaceModel } from "./workspace"

export const conversationParticipantModel = pgTable(
  "ConversationParticipant",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    conversationId: bigintAsString()
      .notNull()
      .references(() => conversationModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    userId: bigintAsString()
      .notNull()
      .references(() => userModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    index("ConversationParticipant_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    index("ConversationParticipant_conversationId_idx").using(
      "btree",
      table.conversationId.asc().nullsLast(),
    ),
    uniqueIndex("ConversationParticipant_conversationId_userId_key").using(
      "btree",
      table.conversationId.asc().nullsLast(),
      table.userId.asc().nullsLast(),
    ),
  ],
)
