import { sql } from "drizzle-orm"
import { integer, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import type { FacebookLeadFieldMappings } from "../partials/facebook-lead-ads-automation"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { flowModel } from "./flow"
import { workspaceModel } from "./workspace"

export const facebookLeadAdsAutomationModel = pgTable(
  "FacebookLeadAdsAutomation",
  {
    ...sharedColumns,
    name: text().notNull(),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    // Facebook Page id — matches IntegrationMessenger.pageId / Inbox.sourceId.
    pageId: text().notNull(),
    pageName: text(),
    // "*" (ALL_FORMS_ID) means every lead form on the page.
    formId: text().notNull(),
    formName: text(),
    fieldMapping: jsonb()
      .$type<FacebookLeadFieldMappings>()
      .notNull()
      .default(sql`'[]'`),
    flowId: bigintAsString().references(() => flowModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    leadsHandledCount: integer().notNull().default(0),
  },
  (table) => [
    uniqueIndex(
      "FacebookLeadAdsAutomation_workspaceId_pageId_formId_key",
    ).using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.pageId.asc().nullsLast(),
      table.formId.asc().nullsLast(),
    ),
  ],
)
