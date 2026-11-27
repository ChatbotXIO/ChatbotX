import { sql } from "drizzle-orm"
import {
  boolean,
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
  type TemplateCategory,
  type TemplateResourceKind,
  type TemplateUninstallEffect,
  type TemplateUninstallOutcome,
  templateCategories,
} from "../partials/template"
import { templateInstallationModel } from "./template-installation"
import { workspaceModel } from "./workspace"

export const templateResourceCategory = pgEnum(
  "templateResourceCategory",
  templateCategories.options as [TemplateCategory, ...TemplateCategory[]],
)

/**
 * Polymorphic per-resource provenance for one install. `resourceId` is a
 * plain bigint with no FK — it spans 15+ target tables. `wasExisting` is
 * load-bearing: a find-or-create manifest match (folder/customField/tag/
 * productCategory) points at a row the installer already owned before this
 * install, and `allowDelete` enforcement must never lock that row against
 * deletion just because a later install happened to reuse it.
 */
export const templateInstalledResourceModel = pgTable(
  "TemplateInstalledResource",
  {
    ...sharedColumns,
    installationId: bigintAsString()
      .notNull()
      .references(() => templateInstallationModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    category: templateResourceCategory().notNull(),
    // Typed to the closed `templateResourceKinds` list; the column stays `text`
    // (no pgEnum). Readers skip and log an unknown value
    // (`keepKnownResourceKinds`); preflight before a rename/removal with
    // `pnpm --filter @chatbotx.io/database template:kinds-preflight`.
    resourceKind: text().$type<TemplateResourceKind>().notNull(),
    resourceId: bigintAsString().notNull(),
    sourceResourceId: text().notNull(),
    wasExisting: boolean().default(false).notNull(),
    // Copied from the template's per-item permission at install time, never
    // re-derived: a later save of the template must not retroactively unlock
    // or lock an installed copy.
    allowEdit: boolean().default(true).notNull(),
    allowDelete: boolean().default(true).notNull(),
    // Set when the copy stops being the template's (the template dropped the
    // item); a detached row no longer locks anything.
    detachedAt: timestamp(timestampConfig),
    // Hash of the entry as written by the install or the last sync, so a sync
    // can tell a locally modified copy from an untouched one; and the template
    // version that wrote it, so resources a sync could not update stay visible.
    syncedHash: text(),
    syncedVersion: integer(),
    // The uninstall's decision for this copy, written in the same transaction
    // as its delete or detach. `deleting` is the durable tombstone.
    uninstallOutcome: text().$type<TemplateUninstallOutcome>(),
    // Post-commit effects of the delete, captured before the row is gone.
    uninstallEffects: jsonb().$type<TemplateUninstallEffect[]>(),
    // How many times the sweep failed to run them; it gives up at a limit.
    uninstallEffectsAttempts: integer().default(0).notNull(),
    // The producer flag(s) the uninstall's freeze overwrote (`{active: true}`),
    // stored in the same transaction as the freeze so a kept or cancelled copy
    // gets its own value back, and only where nobody changed it since.
    uninstallFrozenFrom: jsonb().$type<Record<string, unknown>>(),
    // The point of no return: set when the final dependents probe found no
    // holder. From then on the row is only ever deleted: never kept, unfrozen
    // or cancelled (the column keeps its original name).
    uninstallDrainStartedAt: timestamp(timestampConfig),
  },
  (table) => [
    // The enforcement lookup: which template-installed copy, if any, governs
    // this resource right now.
    index("TemplateInstalledResource_active_lookup_idx")
      .using(
        "btree",
        table.workspaceId.asc().nullsLast(),
        table.resourceKind.asc().nullsLast(),
        table.resourceId.asc().nullsLast(),
      )
      .where(sql`${table.wasExisting} = false AND ${table.detachedAt} IS NULL`),
    // One active row per source item of an install; a detached row is history.
    uniqueIndex("TemplateInstalledResource_active_source_key")
      .using(
        "btree",
        table.installationId.asc().nullsLast(),
        table.resourceKind.asc().nullsLast(),
        table.sourceResourceId.asc().nullsLast(),
      )
      .where(sql`${table.detachedAt} IS NULL`),
    // The effects sweep: only rows that still carry effects, least-tried first.
    index("TemplateInstalledResource_pending_effects_idx")
      .using(
        "btree",
        table.uninstallEffectsAttempts.asc().nullsLast(),
        table.id.asc().nullsLast(),
      )
      .where(sql`${table.uninstallEffects} IS NOT NULL`),
    index("TemplateInstalledResource_installationId_idx").using(
      "btree",
      table.installationId.asc().nullsLast(),
    ),
    index(
      "TemplateInstalledResource_workspaceId_resourceKind_resourceId_idx",
    ).using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.resourceKind.asc().nullsLast(),
      table.resourceId.asc().nullsLast(),
    ),
  ],
)
