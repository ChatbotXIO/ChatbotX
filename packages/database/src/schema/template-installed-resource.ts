import { boolean, index, pgEnum, pgTable, text } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { type TemplateCategory, templateCategories } from "../partials/template"
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
    resourceKind: text().notNull(),
    resourceId: bigintAsString().notNull(),
    sourceResourceId: text().notNull(),
    wasExisting: boolean().default(false).notNull(),
  },
  (table) => [
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
