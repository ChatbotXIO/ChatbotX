import { index, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { templateInstallationModel } from "./template-installation"
import { templateInstallationSyncModel } from "./template-installation-sync"
import { templateInstalledResourceModel } from "./template-installed-resource"
import { workspaceModel } from "./workspace"

/**
 * What a sync overwrote on a locally modified copy, kept so the installer can
 * restore it. Append-only; the newest 5 per installed resource are retained.
 */
export const templateResourceBackupModel = pgTable(
  "TemplateResourceBackup",
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
    syncId: bigintAsString()
      .notNull()
      .references(() => templateInstallationSyncModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    installedResourceId: bigintAsString()
      .notNull()
      .references(() => templateInstalledResourceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    resourceKind: text().notNull(),
    resourceId: bigintAsString().notNull(),
    // Versioned by the adapter that wrote it; restore refuses a mismatch.
    formatVersion: integer().notNull(),
    content: jsonb().$type<Record<string, unknown>>().notNull(),
    byteSize: integer().notNull(),
  },
  (table) => [
    index("TemplateResourceBackup_workspaceId_idx").on(table.workspaceId),
    index("TemplateResourceBackup_installationId_idx").on(table.installationId),
    index("TemplateResourceBackup_syncId_idx").on(table.syncId),
    index("TemplateResourceBackup_installedResourceId_idx").on(
      table.installedResourceId,
    ),
  ],
)
