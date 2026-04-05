import {
  boolean,
  jsonb,
  pgTable,
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
    botEnabled: boolean().default(false).notNull(),
    archivedAt: timestamp(timestampConfig),
    additionalAttributes: jsonb().$type<{
      [x: string]: unknown
    }>(),
    contactLastReadAt: timestamp(timestampConfig),
    agentLastReadAt: timestamp(timestampConfig),
    lastActivityAt: timestamp(timestampConfig).defaultNow().notNull(),
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
    adminRepliedAt: timestamp(timestampConfig),
    contactRepliedAt: timestamp(timestampConfig),
  },
  (table) => [
    uniqueIndex("Conversation_contactId_key").using(
      "btree",
      table.contactId.asc().nullsLast(),
    ),
  ],
)
