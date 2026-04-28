import { boolean, index, integer, pgTable, text } from "drizzle-orm/pg-core"
import { sharedColumns } from "../partials/shared"

export const messageShardModel = pgTable(
  "MessageShard",
  {
    ...sharedColumns,
    name: text().notNull(),
    host: text().notNull(),
    port: integer().default(5432),
    database: text().notNull(),
    user: text().notNull(),
    isActive: boolean().default(false),
  },
  (table) => [
    index("MessageShard_isActive_idx").using(
      "btree",
      table.isActive.asc().nullsLast(),
    ),
  ],
)
