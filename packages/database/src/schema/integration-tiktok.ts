import { index, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { inboxModel } from "./inbox"
import { workspaceModel } from "./workspace"

export const integrationTiktokModel = pgTable(
  "IntegrationTiktok",
  {
    ...sharedColumns,
    auth: jsonb().$type<{ [x: string]: unknown }>().notNull(),
    openId: text().notNull(),
    name: text().notNull(),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    inboxId: bigintAsString()
      .notNull()
      .references(() => inboxModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    tokenRefreshError: text(),
  },
  (table) => [
    index("IntegrationTiktok_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    uniqueIndex("IntegrationTiktok_inboxId_key").using(
      "btree",
      table.inboxId.asc().nullsLast(),
    ),
    uniqueIndex("IntegrationTiktok_openId_key").using(
      "btree",
      table.openId.asc().nullsLast(),
    ),
  ],
)
