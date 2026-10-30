import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { timestampConfig } from "../partials/shared"

export const oauthClientAssertionModel = pgTable(
  "OAuthClientAssertion",
  {
    id: text().primaryKey(),
    expiresAt: timestamp(timestampConfig).notNull(),
  },
  (table) => [index("OAuthClientAssertion_expiresAt_idx").on(table.expiresAt)],
)
