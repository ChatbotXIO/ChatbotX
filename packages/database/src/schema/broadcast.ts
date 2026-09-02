import { sql } from "drizzle-orm"
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import { broadcastScheduleTypes, broadcastStatuses } from "../partials"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { flowModel } from "./flow"
import { integrationMessengerModel } from "./integration-messenger"
import { integrationWhatsappModel } from "./integration-whatsapp"
import { workspaceModel } from "./workspace"

export const broadcastStatus = pgEnum(
  "broadcastStatus",
  broadcastStatuses.options as [string, ...string[]],
)
export const broadcastScheduleType = pgEnum(
  "broadcastScheduleType",
  broadcastScheduleTypes.options as [string, ...string[]],
)

export const broadcastModel = pgTable(
  "Broadcast",
  {
    ...sharedColumns,
    name: text().notNull(),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    flowId: bigintAsString().references(() => flowModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    integrationWhatsappId: bigintAsString().references(
      () => integrationWhatsappModel.id,
      {
        onDelete: "set null",
        onUpdate: "cascade",
      },
    ),
    integrationMessengerId: bigintAsString().references(
      () => integrationMessengerModel.id,
      {
        onDelete: "set null",
        onUpdate: "cascade",
      },
    ),
    templateId: bigintAsString(),
    templateData: jsonb(),
    status: broadcastStatus().notNull(),
    schedulesType: broadcastScheduleType().notNull(),
    schedulesAt: timestamp(timestampConfig).notNull(),
    contactFilter: jsonb(),
    subaction: text().notNull(),
    channel: text().notNull(),
    contactCount: integer(),
    /** Set once every recipient row has been handed to its channel send job; terminal status is resolved after this. */
    handoffCompletedAt: timestamp(timestampConfig),
    /** Soft-delete stamp; purgeBroadcasts hard-deletes after chunked recipient teardown + zero-remaining verification. EVERY Broadcast reader must filter deletedAt IS NULL (see Task 3 checklist). */
    deletedAt: timestamp(timestampConfig),
    /** Dispatch epoch, incremented by resumeSending AND moveToDraft. Suffixes every downstream PER-CONTACT send jobId (defeats BullMQ's 1-hour completed-job dedup on resume) and pins prepare's promotion UPDATE (defeats stale-prepare re-promotion after a moveToDraft → re-schedule round-trip). The sendBroadcast DRIVER jobId (broadcastSendJobId) deliberately stays epoch-FREE — it enforces the single-driver invariant and its removeOnComplete/Fail: true frees the key at terminal state. */
    resumeCount: integer().notNull().default(0),
  },
  (table) => [
    index("Broadcast_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    index("Broadcast_flowId_idx").using(
      "btree",
      table.flowId.asc().nullsLast(),
    ),
    index("Broadcast_channel_idx").using(
      "btree",
      table.channel.asc().nullsLast(),
    ),
    index("Broadcast_schedulesAt_idx").using(
      "btree",
      table.schedulesAt.asc().nullsLast(),
    ),
    index("Broadcast_status_idx").using(
      "btree",
      table.status.asc().nullsLast(),
    ),
    index("Broadcast_deletedAt_idx")
      .using("btree", table.deletedAt.asc().nullsLast())
      .where(sql`"deletedAt" IS NOT NULL`),
  ],
)
