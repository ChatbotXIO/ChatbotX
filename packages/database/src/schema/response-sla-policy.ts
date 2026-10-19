import { sql } from "drizzle-orm"
import { boolean, check, integer, pgTable, unique } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { workspaceModel } from "./workspace"

/**
 * Response SLA of a workspace: how long a human may leave a customer message
 * unanswered, counted in the replying agent's working time. One row per
 * workspace today; the table is keyed by workspace only so per-inbox / per-team
 * rows can be added later without a rewrite.
 */
export const responseSlaPolicyModel = pgTable(
  "ResponseSlaPolicy",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /**
     * Off = nothing is tracked, but the targets are kept so it can be turned
     * back on without retyping them.
     */
    enabled: boolean().default(true).notNull(),
    /** Target for a conversation's first human reply. */
    firstResponseTargetSeconds: integer().notNull(),
    /** Target for later replies; NULL = no SLA on them. */
    nextResponseTargetSeconds: integer(),
    /** A window is "breaching" once this % of its target is left (or less). */
    breachingThresholdPercent: integer().default(25).notNull(),
  },
  (table) => [
    unique("ResponseSlaPolicy_workspaceId_key").on(table.workspaceId),
    check(
      "ResponseSlaPolicy_targets_check",
      sql`${table.firstResponseTargetSeconds} > 0 AND (${table.nextResponseTargetSeconds} IS NULL OR ${table.nextResponseTargetSeconds} > 0)`,
    ),
    check(
      "ResponseSlaPolicy_threshold_check",
      sql`${table.breachingThresholdPercent} BETWEEN 1 AND 99`,
    ),
  ],
)
