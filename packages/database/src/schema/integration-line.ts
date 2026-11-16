import { index, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { inboxModel } from "./inbox"
import { workspaceModel } from "./workspace"

export const integrationLineModel = pgTable(
  "IntegrationLine",
  {
    ...sharedColumns,
    auth: jsonb().$type<{ [x: string]: unknown }>().notNull(),
    channelId: text().notNull(),
    botUserId: text().notNull(),
    basicId: text().notNull(),
    name: text().notNull(),
    pictureUrl: text(),
    tokenRefreshError: text(),
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
  },
  (table) => [
    index("IntegrationLine_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    uniqueIndex("IntegrationLine_inboxId_key").using(
      "btree",
      table.inboxId.asc().nullsLast(),
    ),
    uniqueIndex("IntegrationLine_channelId_key").using(
      "btree",
      table.channelId.asc().nullsLast(),
    ),
    uniqueIndex("IntegrationLine_botUserId_key").using(
      "btree",
      table.botUserId.asc().nullsLast(),
    ),
  ],
)
