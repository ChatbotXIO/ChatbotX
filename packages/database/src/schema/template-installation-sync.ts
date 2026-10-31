import { sql } from "drizzle-orm"
import {
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
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import {
  type TemplateActorKind,
  type TemplateSyncStatus,
  type TemplateSyncTrigger,
  type TemplateWarning,
  templateSyncStatuses,
  templateSyncTriggers,
} from "../partials/template"
import { userModel } from "./auth-user"
import { templateInstallationModel } from "./template-installation"
import { workspaceModel } from "./workspace"

export const templateSyncStatus = pgEnum(
  "templateSyncStatus",
  templateSyncStatuses.options as [TemplateSyncStatus, ...TemplateSyncStatus[]],
)
export const templateSyncTrigger = pgEnum(
  "templateSyncTrigger",
  templateSyncTriggers.options as [
    TemplateSyncTrigger,
    ...TemplateSyncTrigger[],
  ],
)

export type TemplateSyncCounts = {
  created: number
  updated: number
  detached: number
  overwrittenModified: number
  notUpdatable: number
}

/**
 * One sync of an installed copy to a newer template version — also its own
 * outbox: the row is claimed with a lease by the worker and re-dispatched by
 * the sweep. Execution reads every option from the row, never from queue args.
 */
export const templateInstallationSyncModel = pgTable(
  "TemplateInstallationSync",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    installationId: bigintAsString()
      .notNull()
      .references(() => templateInstallationModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    status: templateSyncStatus().notNull().default("pending"),
    trigger: templateSyncTrigger().notNull(),
    requestedVersion: integer().notNull(),
    // Set for manual and reinstall syncs so a replayed request returns the
    // same row.
    idempotencyKey: text(),
    // Hash of the trigger and inputs the keyed request carried; a replay with
    // a different fingerprint is a reused key, not a replay.
    requestFingerprint: text(),
    // The member who asked (null: a workspace API token, or an automatic
    // update). The sync runs with their permissions, not the installer's.
    requestedBy: bigintAsString().references(() => userModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    // See `TemplateInstallation.installedByKind`.
    requestedByKind: text()
      .$type<TemplateActorKind>()
      .default("apiToken")
      .notNull(),
    claimToken: text(),
    claimedAt: timestamp(timestampConfig),
    attempts: integer().default(0).notNull(),
    errorCode: text(),
    // Written under the execution lock: what the sync actually applied.
    fromVersion: integer(),
    appliedVersion: integer(),
    appliedHash: text(),
    counts: jsonb().$type<TemplateSyncCounts>(),
    warnings: jsonb().$type<TemplateWarning[]>().default([]).notNull(),
    warningSummary: jsonb().$type<{ code: string; count: number }[]>(),
    startedAt: timestamp(timestampConfig),
    finishedAt: timestamp(timestampConfig),
  },
  (table) => [
    index("TemplateInstallationSync_workspaceId_idx").on(table.workspaceId),
    index("TemplateInstallationSync_requestedBy_idx").on(table.requestedBy),
    index("TemplateInstallationSync_installationId_idx").on(
      table.installationId,
    ),
    // A publisher save enqueues one sync per installation and version.
    uniqueIndex("TemplateInstallationSync_auto_active_key")
      .on(table.installationId, table.requestedVersion)
      .where(
        sql`${table.trigger} = 'autoUpdate' AND ${table.status} IN ('pending', 'running')`,
      ),
    uniqueIndex("TemplateInstallationSync_idempotency_key")
      .on(table.installationId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
    // Sweep scan.
    index("TemplateInstallationSync_status_claimedAt_idx").on(
      table.status,
      table.claimedAt,
    ),
  ],
)
