import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { type TemplatePayload, templateModel } from "./template"
import { workspaceModel } from "./workspace"

/**
 * Append-only history of a template's saved payloads, so an install or sync
 * applies exactly the version it was pinned to even when the publisher saves
 * again meanwhile. Pruned to the newest 20 plus any version still pinned by a
 * non-terminal installation or sync.
 */
export const templateVersionModel = pgTable(
  "TemplateVersion",
  {
    ...sharedColumns,
    templateId: bigintAsString()
      .notNull()
      .references(() => templateModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    version: integer().notNull(),
    payload: jsonb().$type<TemplatePayload>().notNull(),
    payloadHash: text().notNull(),
    formatVersion: integer().notNull(),
  },
  (table) => [
    uniqueIndex("TemplateVersion_templateId_version_key").on(
      table.templateId,
      table.version,
    ),
    index("TemplateVersion_workspaceId_idx").on(table.workspaceId),
  ],
)
