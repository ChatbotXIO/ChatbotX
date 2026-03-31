import { createId } from "@chatbotx.io/utils"
import { sql } from "drizzle-orm"
import { bigint, type PgTimestampConfig, timestamp } from "drizzle-orm/pg-core"

export const timestampConfig: PgTimestampConfig<"date"> = {
  precision: 6,
  withTimezone: true,
}

export const sharedColumns = {
  id: bigint({ mode: "bigint" })
    .primaryKey()
    .$defaultFn(() => createId()),
  createdAt: timestamp("created_at", timestampConfig).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", timestampConfig)
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
}
