import { sql } from "drizzle-orm"
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  type ChannelPostSyncStatus,
  channelPostSyncStatuses,
} from "../partials/channel-post"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { inboxModel } from "./inbox"
import { workspaceModel } from "./workspace"

export const channelPostSyncStatus = pgEnum(
  "channelPostSyncStatus",
  channelPostSyncStatuses.options as [
    ChannelPostSyncStatus,
    ...ChannelPostSyncStatus[],
  ],
)

/**
 * One row per inbox whose channel's posts are kept in `ChannelPost`: where the
 * last sync stopped and who owns the running one. A worker owns the row while
 * `status = 'running'` and every write it makes is conditional on its
 * `claimToken`, so a worker taken over after a stall cannot overwrite its
 * successor.
 */
export const channelPostSyncModel = pgTable(
  "ChannelPostSync",
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
    // The inbox's channel (a ChannelType), kept so the scanner never joins.
    channel: text().notNull(),
    status: channelPostSyncStatus().notNull().default("idle"),
    // Where the next job resumes inside an unfinished listing; null = start over.
    resumeCursor: text(),
    // Set once the first full listing finished.
    backfillCompletedAt: timestamp(timestampConfig),
    lastSyncedAt: timestamp(timestampConfig),
    // When the row is next due (`idle`/`queued`); a `queued` row that is still
    // here after this time lost its job and is queued again.
    nextSyncAt: timestamp(timestampConfig),
    // The last manual refresh, for the per-inbox cooldown.
    lastRequestedAt: timestamp(timestampConfig),
    lastHeartbeatAt: timestamp(timestampConfig),
    claimToken: text(),
    attempts: integer().notNull().default(0),
    // Posts the last job or cycle upserted.
    syncedCount: integer().notNull().default(0),
    lastError: text(),
    // The `ChannelErrorCategory` of `lastError`, so the UI can offer a re-authorisation.
    lastErrorCategory: text(),
  },
  (table) => [
    uniqueIndex("ChannelPostSync_inboxId_key").on(table.inboxId),
    index("ChannelPostSync_workspaceId_idx").on(table.workspaceId),
    // The scanner's due predicate.
    index("ChannelPostSync_due_idx")
      .on(table.nextSyncAt, table.id)
      .where(sql`${table.status} IN ('idle', 'queued')`),
    // The scanner's stalled-owner predicate.
    index("ChannelPostSync_stalled_idx")
      .on(table.lastHeartbeatAt, table.id)
      .where(sql`${table.status} = 'running'`),
    // The scanner's release of rows parked as not connected.
    index("ChannelPostSync_parked_notConnected_idx")
      .on(table.id)
      .where(
        sql`${table.status} = 'idle' AND ${table.lastErrorCategory} = 'notConnected'`,
      ),
  ],
)
