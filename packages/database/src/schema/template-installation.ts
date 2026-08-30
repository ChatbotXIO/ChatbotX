import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import {
  type TemplateInstallationStatus,
  type TemplatePermissions,
  type TemplateWarning,
  templateInstallationStatuses,
} from "../partials/template"
import { userModel } from "./auth-user"
import { folderModel } from "./folder"
import { templateModel } from "./template"
import { workspaceModel } from "./workspace"

export const templateInstallationStatus = pgEnum(
  "templateInstallationStatus",
  templateInstallationStatuses.options as [
    TemplateInstallationStatus,
    ...TemplateInstallationStatus[],
  ],
)

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
    completedAt: timestamp(timestampConfig),
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
  ],
)
