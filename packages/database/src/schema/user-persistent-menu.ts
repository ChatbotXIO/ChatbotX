import { sql } from "drizzle-orm"
import { index, jsonb, pgTable, text } from "drizzle-orm/pg-core"
import type { MessengerPersistentMenu } from "../partials/integration-messenger"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { workspaceModel } from "./workspace"

export const userPersistentMenuModel = pgTable(
  "UserPersistentMenu",
  {
    ...sharedColumns,
    name: text().notNull(),
    menus: jsonb()
      .$type<MessengerPersistentMenu[]>()
      .default(sql`[]`)
      .notNull(),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    index("UserPersistentMenu_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
  ],
)
