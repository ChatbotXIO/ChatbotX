import { boolean, index, integer, pgTable, text } from "drizzle-orm/pg-core"
import { sharedColumns } from "../../../partials/shared"

export const sslModes = [
  "disable",
  "require",
  "verify-ca",
  "verify-full",
] as const
export type SslMode = (typeof sslModes)[number]

export const messageShardModel = pgTable(
  "MessageShard",
  {
    ...sharedColumns,
    name: text().notNull(),
    host: text().notNull(),
    port: integer().default(5432),
    database: text().notNull(),
    user: text().notNull(),
    credentialRef: text(),
    sslMode: text().$type<SslMode>().default("disable"),
    isActive: boolean().default(false),
    shardKey: integer(),
    readHost: text(),
    readPort: integer(),
  },
  (table) => [
    index("MessageShard_isActive_idx").using(
      "btree",
      table.isActive.asc().nullsLast(),
    ),
    index("MessageShard_shardKey_idx").using(
      "btree",
      table.shardKey.asc().nullsLast(),
    ),
  ],
)
