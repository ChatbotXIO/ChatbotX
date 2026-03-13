import { sql } from "drizzle-orm"
import { text, timestamp } from "drizzle-orm/pg-core"

export const sharedColumns = {
  id: text().primaryKey(),
  createdAt: timestamp({ precision: 6, withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp({ precision: 6, withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
}
