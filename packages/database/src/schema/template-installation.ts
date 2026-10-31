import { sql } from "drizzle-orm"
import {
  boolean,
  index,
  integer,
  jsonb,
  type PgColumn,
  pgEnum,
  pgTable,
  smallint,
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
  type TemplateInstallationStatus,
  type TemplatePermissions,
  type TemplateUninstallCounts,
  type TemplateUninstallRequester,
  type TemplateUninstallState,
  type TemplateWarning,
  templateInstallationStatuses,
  templateUninstallStates,
} from "../partials/template"
import { userModel } from "./auth-user"
import { folderModel } from "./folder"
import { templateModel } from "./template"
import { templateUninstallOperationModel } from "./template-uninstall-operation"
import { workspaceModel } from "./workspace"

export const templateInstallationStatus = pgEnum(
  "templateInstallationStatus",
  templateInstallationStatuses.options as [
    TemplateInstallationStatus,
    ...TemplateInstallationStatus[],
  ],
)

export const templateUninstallState = pgEnum(
  "templateUninstallState",
  templateUninstallStates.options as [
    TemplateUninstallState,
    ...TemplateUninstallState[],
  ],
)

/**
 * Staged-object generations still owed a delete: a failed install owes its
 * current generation, any other row only the generations a retry left behind.
 * Shared by the partial index and the sweep's query (literal SQL, no bind
 * parameters), so the planner can prove the query implies the index predicate.
 */
export const stagedCleanupOwed = (table: {
  status: PgColumn
  stagedCleanedGeneration: PgColumn
  stagingGeneration: PgColumn
}) =>
  sql`((${table.status} = 'failed' AND ${table.stagedCleanedGeneration} < ${table.stagingGeneration}) OR (${table.status} <> 'failed' AND ${table.stagedCleanedGeneration} < ${table.stagingGeneration} - 1))`

/**
 * The install job header AND progress row — the only status surface for a
 * share-link install. `templateId` is `set null` (not cascade): provenance
 * must outlive the author deleting the template, or `allowDelete`
 * enforcement silently loses its rule. `sourceWorkspaceId` is a plain bigint
 * with no FK — it spans tenants and is never dereferenced during install.
 */
export const templateInstallationModel = pgTable(
  "TemplateInstallation",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    templateId: bigintAsString().references(() => templateModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    // Denormalized so the row still reads clearly after the template (or its
    // name) changes or is deleted.
    templateName: text().notNull(),
    sourceWorkspaceId: bigintAsString().notNull(),
    formatVersion: integer().notNull(),
    status: templateInstallationStatus().notNull().default("pending"),
    permissions: jsonb().$type<TemplatePermissions>().notNull(),
    warnings: jsonb().$type<TemplateWarning[]>().default([]).notNull(),
    warningCount: integer().default(0).notNull(),
    errorMessage: text(),
    resourceCount: integer().default(0).notNull(),
    // The root folder this install's resources were nested under, when the
    // source template has `createInstallFolder` enabled. `set null` (not
    // cascade) so a workspace admin deleting the folder later doesn't cascade
    // into deleting this tracking row.
    installFolderId: bigintAsString().references(() => folderModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    // Copied from `Template.defaultAutoUpdate` at install time; the
    // installer can flip it afterward independent of the publisher's
    // template-wide default.
    autoUpdate: boolean().default(false).notNull(),
    // `Template.updatedAt` at the moment this installation was created —
    // compared against the live `Template.updatedAt` to derive
    // "update available" without a separate version counter.
    sourceUpdatedAt: timestamp(timestampConfig),
    installedBy: bigintAsString().references(() => userModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    // Persisted so a member whose user row is later deleted (`installedBy`
    // set null) reads as lost access, not as an API token with full power.
    installedByKind: text()
      .$type<TemplateActorKind>()
      .default("apiToken")
      .notNull(),
    completedAt: timestamp(timestampConfig),
    // Which attempt generation the storage objects staged now belong to
    // (`tpl-<id>/g<n>/`). A manual retry bumps it, so a retry never writes
    // the keys a still-running cleanup of the failed attempt is deleting.
    stagingGeneration: integer().default(0).notNull(),
    // Every generation up to and including this one has had its staged
    // objects deleted (-1: none yet). Advanced only after a delete that
    // removed every key, so a failed cleanup is retried by the sweep.
    stagedCleanedGeneration: integer().default(-1).notNull(),
    // Lease on a running cleanup; one sweep worker deletes at a time.
    stagedCleanupClaimedAt: timestamp(timestampConfig),
    // Flows an install or sync published live, whose after-publish effects
    // (cache drop, Meta welcome-flow sync, stale quick-reply state) are still
    // owed. Written in the same transaction as the completion and cleared once
    // run, so a crash after commit cannot lose them; the sweep re-runs them.
    pendingPublishEffects:
      jsonb().$type<{ flowId: string; versionId: string }[]>(),
    // Durable-dispatch fields (the `InboundWebhookRequest` outbox pattern):
    // the worker claims the row with `claimToken`/`claimedAt` as a lease, so
    // a redelivered or swept job is a no-op unless the lease expired.
    claimToken: text(),
    claimedAt: timestamp(timestampConfig),
    attempts: integer().default(0).notNull(),
    // Machine-readable failure code; the raw `errorMessage` never reaches
    // the client.
    errorCode: text(),
    // Immutable provenance — unlike `templateId` it is never nulled, so the
    // sweep and install-count grouping survive the template being deleted.
    sourceTemplateId: bigintAsString(),
    // Counts install and reinstall completions (auto/manual syncs excluded);
    // the "Installs" figure sums it over active installations only.
    successfulInstallEvents: integer().default(0).notNull(),
    // Set when the source template is deleted: the copies stop being governed
    // by it, so its locks no longer apply.
    sourceDeletedAt: timestamp(timestampConfig),
    // The installer's choice of target inbox for each inbox the template was
    // built around: `{ sourceInboxId: targetInboxId }`. Validated when the
    // install is requested and applied by the worker; null when none.
    inboxBindings: jsonb().$type<Record<string, string>>(),
    // The `TemplateVersion` this installation last fully applied (the one an
    // install reads its payload from), and when a sync last finished.
    // Opaque, random reference to this (template, target workspace) pair,
    // shared by every installation row of the pair. The publisher lists and
    // addresses installers by it; it reveals no workspace or row id.
    publisherRef: text().default("").notNull(),
    // The disclosure version the installer accepted ("the publisher sees this
    // workspace's name and can uninstall the template"); 0 = not granted.
    publisherUninstallGrant: smallint().default(0).notNull(),
    // Set when the installation was uninstalled: by whom, when, and what became of its copies.
    uninstalledAt: timestamp(timestampConfig),
    uninstalledByKind: text().$type<TemplateUninstallRequester>(),
    uninstallCounts: jsonb().$type<TemplateUninstallCounts>(),
    // Durable uninstall state machine (see `TemplateUninstallState`); the row
    // is its own outbox, claimed with a 5-minute lease and fenced by the token.
    uninstallState: templateUninstallState().default("none").notNull(),
    uninstallRequestedByKind: text().$type<TemplateUninstallRequester>(),
    uninstallRequestedBy: bigintAsString().references(() => userModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    uninstallRequestedAt: timestamp(timestampConfig),
    // Bumped by every request; part of the job id so a retry is never
    // swallowed by an old job.
    uninstallAttempt: integer().default(0).notNull(),
    uninstallClaimToken: text(),
    uninstallClaimedAt: timestamp(timestampConfig),
    uninstallErrorCode: text(),
    uninstallOperationId: bigintAsString().references(
      () => templateUninstallOperationModel.id,
      { onDelete: "set null", onUpdate: "cascade" },
    ),
    sourceVersion: integer().default(1).notNull(),
    lastSyncedAt: timestamp(timestampConfig),
  },
  (table) => [
    index("TemplateInstallation_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    index("TemplateInstallation_templateId_idx").using(
      "btree",
      table.templateId.asc().nullsLast(),
    ),
    index("TemplateInstallation_workspaceId_status_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.status.asc().nullsLast(),
    ),
    // At most one in-flight install per (workspace, source template): a double
    // click or a replayed request can never queue two copies at once.
    uniqueIndex("TemplateInstallation_workspaceId_sourceTemplateId_active_key")
      .using(
        "btree",
        table.workspaceId.asc().nullsLast(),
        table.sourceTemplateId.asc().nullsLast(),
      )
      .where(sql`${table.status} IN ('pending', 'installing')`),
    // Hot paths filter by the source template alone: the update fan-out and
    // its sweep, the version prune, and marking a deleted source.
    index("TemplateInstallation_sourceTemplateId_idx").using(
      "btree",
      table.sourceTemplateId.asc().nullsLast(),
    ),
    index("TemplateInstallation_templateId_publisherRef_idx").using(
      "btree",
      table.templateId.asc().nullsLast(),
      table.publisherRef.asc().nullsLast(),
    ),
    index("TemplateInstallation_uninstallRequestedBy_idx").using(
      "btree",
      table.uninstallRequestedBy.asc().nullsLast(),
    ),
    index("TemplateInstallation_uninstallOperationId_idx").using(
      "btree",
      table.uninstallOperationId.asc().nullsLast(),
    ),
    // Uninstall sweep scan: `pending` rows and expired `running` leases.
    index("TemplateInstallation_uninstallState_claimedAt_idx")
      .using(
        "btree",
        table.uninstallState.asc().nullsLast(),
        table.uninstallClaimedAt.asc().nullsLast(),
      )
      .where(sql`${table.uninstallState} IN ('pending', 'running')`),
    // Sweep scan for installs whose after-publish effects are still owed.
    index("TemplateInstallation_pendingPublishEffects_updatedAt_idx")
      .using("btree", table.updatedAt.asc().nullsLast())
      .where(sql`${table.pendingPublishEffects} IS NOT NULL`),
    // Sweep scan for staged-object generations still to delete. Nearly every
    // row owes nothing, so the partial predicate keeps the index tiny.
    index("TemplateInstallation_stagedCleanupOwed_updatedAt_idx")
      .using("btree", table.updatedAt.asc().nullsLast())
      .where(stagedCleanupOwed(table)),
    // Sweep scan: stale `pending` rows and expired `installing` leases.
    index("TemplateInstallation_status_claimedAt_idx").using(
      "btree",
      table.status.asc().nullsLast(),
      table.claimedAt.asc().nullsLast(),
    ),
  ],
)
