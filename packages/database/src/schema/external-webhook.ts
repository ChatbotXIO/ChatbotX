import { index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { workspaceModel } from "./workspace"

export const externalWebhookModel = pgTable(
  "ExternalWebhook",
  {
    ...sharedColumns,
    provider: text().notNull().default("make"),
    event: text().notNull(),
    url: text().notNull(),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    index("ExternalWebhook_workspaceId_event_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.event.asc().nullsLast(),
    ),
    uniqueIndex("ExternalWebhook_workspaceId_event_url_key").on(
      table.workspaceId,
      table.event,
      table.url,
    ),
  ],
)
