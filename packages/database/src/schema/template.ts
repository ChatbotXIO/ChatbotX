import {
  boolean,
  index,
  integer,
  jsonb,
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
import type {
  TemplateCategoryCounts,
  TemplatePermissions,
  TemplateSelection,
} from "../partials/template"
import { userModel } from "./auth-user"
import { tenantModel } from "./enterprise/tenant"
import { workspaceModel } from "./workspace"

/**
 * A snapshot envelope stored at save time — see
 * `packages/flow-config/src/import-export/template-schema.ts` for the
 * validated shape. Kept loose here (jsonb) so a `formatVersion` bump never
 * requires a DB migration; `parseTemplateExport` is the real gate, run on
 * every install.
 */
export type TemplatePayload = Record<string, unknown>

export const templateModel = pgTable(
  "Template",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    // The publisher's tenant, stamped at save time — never request-derived.
    // Same-tenant install gate compares this against the *target* workspace's
    // `Workspace.tenantId`, not the acting request's tenant context.
    tenantId: bigintAsString()
      .notNull()
      .references(() => tenantModel.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    name: text().notNull(),
    description: text(),
    imageUrl: text(),
    publisherName: text(),
    youtubeVideoId: text(),
    testLink: text(),
    selection: jsonb().$type<TemplateSelection>().notNull(),
    payload: jsonb().$type<TemplatePayload>().notNull(),
    categoryCounts: jsonb().$type<TemplateCategoryCounts>().notNull(),
    formatVersion: integer().notNull(),
    // High-entropy, never the row's own snowflake id — the id is enumerable
    // and would let a share link be guessed.
    shareToken: text().notNull(),
    shareEnabled: boolean().default(false).notNull(),
    shareExpiresAt: timestamp(timestampConfig),
    defaultPermissions: jsonb().$type<TemplatePermissions>().notNull(),
    createInstallFolder: boolean().default(false).notNull(),
    defaultAutoUpdate: boolean().default(false).notNull(),
    installCount: integer().default(0).notNull(),
    createdBy: bigintAsString().references(() => userModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    deletedAt: timestamp(timestampConfig),
  },
  (table) => [
    index("Template_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    index("Template_tenantId_idx").using(
      "btree",
      table.tenantId.asc().nullsLast(),
    ),
    uniqueIndex("Template_shareToken_key").on(table.shareToken),
  ],
)
