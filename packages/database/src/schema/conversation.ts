import { sql } from "drizzle-orm"
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { userModel } from "./auth-user"
import { contactModel } from "./contact"
import { inboxTeamModel } from "./inbox-team"
import { workspaceModel } from "./workspace"

export const conversationModel = pgTable(
  "Conversation",
  {
    ...sharedColumns,
    botEnabled: boolean().default(true).notNull(),
    botResumeAt: timestamp(timestampConfig),
    archivedAt: timestamp(timestampConfig),
    additionalAttributes: jsonb().$type<{
      [x: string]: unknown
    }>(),
    contactLastReadAt: timestamp(timestampConfig),
    agentLastReadAt: timestamp(timestampConfig),
    aiContextLastMessageId: bigintAsString(),
    lastActivityAt: timestamp(timestampConfig),
    followed: boolean().default(false).notNull(),
    assignedUserId: bigintAsString().references(() => userModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    assignedInboxTeamId: bigintAsString().references(() => inboxTeamModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    contactId: bigintAsString()
      .notNull()
      .references(() => contactModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    sourceId: text(),
    adminRepliedAt: timestamp(timestampConfig),
    contactRepliedAt: timestamp(timestampConfig),
  },
  (table) => [
    uniqueIndex("Conversation_contactId_sourceId_key")
      .on(table.contactId, table.sourceId)
      .where(sql`${table.sourceId} IS NOT NULL`),
    uniqueIndex("Conversation_contactId_dm_key")
      .on(table.contactId)
      .where(sql`${table.sourceId} IS NULL`),
    index("Conversation_aiContextLastMessageId_idx").on(
      table.aiContextLastMessageId,
    ),
    index("Conversation_workspaceId_lastActivityAt_id_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.lastActivityAt.desc().nullsLast(),
      table.id.desc(),
    ),
  ],
)
