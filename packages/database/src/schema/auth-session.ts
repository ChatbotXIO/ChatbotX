import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { userModel } from "./auth-user"

export const sessionModel = pgTable(
  "Session",
  {
    ...sharedColumns,
    expiresAt: timestamp(timestampConfig).notNull(),
    token: text().notNull(),
    ipAddress: text(),
    userAgent: text(),
    userId: bigintAsString()
      .notNull()
      .references(() => userModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    uniqueIndex("Session_token_key").using(
      "btree",
      table.token.asc().nullsLast(),
    ),
  ],
)
