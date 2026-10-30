import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { timestampConfig } from "../partials/shared"

/**
 * A client-assertion JTI digest. This intentionally uses a text primary key:
 * Better Auth derives it from the client id and assertion JTI so concurrent
 * replays collide atomically across application instances.
 */
export const oauthClientAssertionModel = pgTable(
  "OAuthClientAssertion",
  {
    id: text().primaryKey(),
    expiresAt: timestamp(timestampConfig).notNull(),
  },
  (table) => [index("OAuthClientAssertion_expiresAt_idx").on(table.expiresAt)],
)
