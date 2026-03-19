import { sql } from "drizzle-orm"
import { type PgTimestampConfig, text, timestamp } from "drizzle-orm/pg-core"

export const timestampConfig: PgTimestampConfig<"date"> = {
  precision: 6,
  withTimezone: true,
}

export const sharedColumns = {
  id: text().primaryKey(),
  createdAt: timestamp(timestampConfig).defaultNow().notNull(),
  updatedAt: timestamp(timestampConfig)
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
}
