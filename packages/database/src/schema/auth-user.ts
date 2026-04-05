import { boolean, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import { sharedColumns } from "../partials/shared"

export const userModel = pgTable(
  "User",
  {
    ...sharedColumns,
    name: text(),
    email: text().notNull(),
    emailVerified: boolean().default(false).notNull(),
    image: text(),
    isAnonymous: boolean().default(false).notNull(),
  },
  (table) => [
    uniqueIndex("User_email_key").using("btree", table.email.asc().nullsLast()),
  ],
)
