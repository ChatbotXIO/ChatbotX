import { sql } from "drizzle-orm"
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  broadcastScheduleTypes,
  broadcastStatuses,
  broadcastTargetModes,
} from "../partials"
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
    /**
     * Which layout scopes the audience and templates: `channel` (legacy —
     * the integration columns above, else the whole channel) or `targets`
     * (the `BroadcastTarget` rows). Persisted rather than derived from the
     * presence of target rows, because those rows cascade away with their
     * inbox and an empty target list must then mean "nobody", never
     * "every page of the channel".
     */
    targetMode: text().notNull().default(broadcastTargetModes.enum.channel),
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
    /** 1-based inclusive start position over the ascending-id audience order; null = from the beginning. See `resolveBroadcastAudienceRange` in partials/broadcast.ts. */
    audienceRangeStart: integer(),
    /** 1-based inclusive end position over the ascending-id audience order; null = to the end. */
    audienceRangeEnd: integer(),
    /** Recipients handed to channel send jobs per dispatch minute; null = `BROADCAST_DEFAULT_SEND_RATE_PER_MINUTE`. No `.default()` — null is the "unset" state the form/API send. */
    sendRatePerMinute: integer(),
    /**
     * Set on a run spawned by a repeating broadcast: the template that owns the
     * schedule. `set null` so purging a template leaves its runs intact — they
     * stay hidden from the default list through `occurrenceAt`, which is kept.
     */
    parentBroadcastId: bigintAsString().references(
      (): AnyPgColumn => broadcastModel.id,
      {
        onDelete: "set null",
        onUpdate: "cascade",
      },
    ),
    /** The scheduled slot this run was created for; null on every non-run broadcast. */
    occurrenceAt: timestamp(timestampConfig),
  },
  (table) => [
    index("Broadcast_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    index("Broadcast_workspaceId_active_idx")
      .on(table.workspaceId, table.channel)
      .where(sql`"status" IN ('scheduled', 'sending') AND "deletedAt" IS NULL`),
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
    // A purged template may null the FK while `occurrenceAt` keeps the run
    // identifiable, so the pair is only constrained in one direction.
    check(
      "Broadcast_occurrence_pair_check",
      sql`"parentBroadcastId" IS NULL OR "occurrenceAt" IS NOT NULL`,
    ),
    // Unconditional on purpose: NULLs are distinct, so one-off broadcasts are
    // unaffected, and `ON CONFLICT (cols)` can infer it without a predicate.
    uniqueIndex("Broadcast_parentBroadcastId_occurrenceAt_key").on(
      table.parentBroadcastId,
      table.occurrenceAt,
    ),
  ],
)
