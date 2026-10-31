import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { timestampConfig } from "../partials/shared"

export const oauthClientAssertionModel = pgTable(
  "OAuthClientAssertion",
  {
    // Digest of the client assertion `jti`; the primary key enforces replay
    // protection, so Better Auth supplies it instead of a generated id.
    id: text().primaryKey(),
    expiresAt: timestamp(timestampConfig).notNull(),
  },
  (table) => [index("OAuthClientAssertion_expiresAt_idx").on(table.expiresAt)],
)
