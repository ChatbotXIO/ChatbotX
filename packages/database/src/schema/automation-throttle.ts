import {
  index,
  pgEnum,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { automationThrottleTypes } from "../partials/automation-throttle"
import { bigintAsString, timestampConfig } from "../partials/shared"
import { contactInboxModel } from "./contact-inbox"
import { workspaceModel } from "./workspace"

export const automationThrottleType = pgEnum(
  "automationThrottleType",
  automationThrottleTypes.options as [string, ...string[]],
)

/**
 * Postgres source of truth for the hybrid automation throttle. This model is
 * **typing
 * only** — the physical table is hash-partitioned by `workspaceId` (×32) via
 * a hand-written migration (`drizzle-database` skill: partitioned tables
 * cannot be expressed through `pgTable`/`make:migration`), mirroring
 * `ContactOnSequence`.
 *
 * No `sharedColumns.id` — this is a state table keyed by its natural
 * identity `(workspaceId, contactInboxId, throttleType, subjectId)`, which
 * also doubles as the `ON CONFLICT` target for the atomic claim upsert.
 * `workspaceId` <-> `contactInboxId` consistency is app-enforced: unlike
 * `ContactOnSequence`, `ContactInbox` carries no `workspaceId` column, so a
 * composite FK is impossible.
 */
export const automationThrottleModel = pgTable(
  "AutomationThrottle",
  {
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    contactInboxId: bigintAsString()
      .notNull()
      .references(() => contactInboxModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    throttleType: automationThrottleType().notNull(),
    // No default — the service always passes it explicitly ("0" for the
    // default-reply singleton, or e.g. a flowId for a future per-flow scope).
    subjectId: bigintAsString().notNull(),
    lastTriggeredAt: timestamp(timestampConfig).notNull().defaultNow(),
    claimId: uuid().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.workspaceId,
        table.contactInboxId,
        table.throttleType,
        table.subjectId,
      ],
      name: "AutomationThrottle_pkey",
    }),
    index("AutomationThrottle_lastTriggeredAt_idx").on(table.lastTriggeredAt),
  ],
)
