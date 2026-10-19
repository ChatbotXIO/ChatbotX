import { sql } from "drizzle-orm"
import {
  boolean,
  index,
  integer,
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
    lastStep: text(),
    currentStep: text(),
    adminRepliedAt: timestamp(timestampConfig),
    contactRepliedAt: timestamp(timestampConfig),
    /** Start of the open window in which a human reply is owed (DM only). */
    awaitingHumanReplySince: timestamp(timestampConfig),
    /**
     * Last instant a HUMAN closed the reply window (agent reply claim, an
     * external native-app echo, archive); stale inbound events are ignored.
     * Bot closes do not advance it.
     */
    awaitingHumanReplyClosedAt: timestamp(timestampConfig),
    /** Instant `assignedUserId` last changed to a non-null user. */
    assignedUserAt: timestamp(timestampConfig),
    /**
     * Response SLA snapshot of the open waiting window (see
     * `ResponseSlaPolicy`): the working-time deadline, the instant it turns
     * "breaching", and the target it was computed from. Set and cleared
     * together with `awaitingHumanReplySince`; all NULL while no SLA applies.
     */
    responseDueAt: timestamp(timestampConfig),
    responseSlaBreachingAt: timestamp(timestampConfig),
    responseSlaTargetSeconds: integer(),
  },
  (table) => [
    uniqueIndex("Conversation_contactId_sourceId_key")
      .on(table.contactId, table.sourceId)
      .where(sql`${table.sourceId} IS NOT NULL`),
    uniqueIndex("Conversation_contactId_dm_key")
      .on(table.contactId)
      .where(sql`${table.sourceId} IS NULL`),
    index("Conversation_contactId_idx").on(table.contactId),
    // Inbox SLA filter: only the (few) conversations with an open SLA window.
    index("Conversation_workspaceId_responseDueAt_idx")
      .on(table.workspaceId, table.responseDueAt)
      .where(sql`${table.responseDueAt} IS NOT NULL`),
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
