import {
  index,
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
import { workspaceModel } from "./workspace"

/**
 * One upserted row per registered FreeSWITCH softphone, kept live by
 * `sofia::register`/`unregister`/`expire` ESL events. Bounds the
 * inbound ring-fan-out to registered agents with inbox permission and
 * powers realtime presence badges. Correctness of call routing never
 * depends on this table being fresh — FreeSWITCH itself drops a ring
 * target that isn't actually registered — it only bounds fan-out.
 */
export const agentSipPresenceModel = pgTable(
  "AgentSipPresence",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    userId: bigintAsString()
      .notNull()
      .references(() => userModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /** SIP contact URI from the REGISTER, for diagnostics. */
    contact: text(),
    /** When this registration expires; a stale row is skipped by ring selection. */
    expiresAt: timestamp(timestampConfig).notNull(),
    /** Last time this agent was included in a ring set (least-recently-rung ordering). */
    lastRungAt: timestamp(timestampConfig),
  },
  (table) => [
    uniqueIndex("AgentSipPresence_workspaceId_userId_key").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.userId.asc().nullsLast(),
    ),
    // Ring selection (`selectRingTargets`): one index range scan on
    // workspace + freshness, then order by least-recently-rung.
    index("AgentSipPresence_ring_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.expiresAt.desc(),
      table.lastRungAt.asc().nullsFirst(),
    ),
  ],
)
