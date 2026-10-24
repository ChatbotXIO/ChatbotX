import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import { bigintAsString, timestampConfig } from "../partials/shared"

// Partitioned by HASH(workspaceId) in its migration, with no FKs (see
// ContactActivity). Keeps the full text of inbound messages that matched a
// keyword rule, keyed by messageId so a retried dispatch cannot duplicate it.
export const contactKeywordMessageModel = pgTable(
  "ContactKeywordMessage",
  {
    workspaceId: bigintAsString().notNull(),
    contactId: bigintAsString().notNull(),
    messageId: bigintAsString().notNull(),
    automatedResponseId: bigintAsString().notNull(),
    text: text().notNull(),
    // Lower-cased, accent-stripped `text`, produced by the shared normalizer.
    normalizedText: text().notNull(),
    occurredAt: timestamp(timestampConfig).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.workspaceId, table.contactId, table.messageId],
      name: "ContactKeywordMessage_pkey",
    }),
    // Contains / ends-with matching. The opclass is set in the migration (and
    // pinned by a catalog test) because the column type alone cannot express it.
    index("ContactKeywordMessage_text_trgm_idx").using(
      "gin",
      table.normalizedText.op("gin_trgm_ops"),
    ),
    // Equals / starts-with matching.
    index("ContactKeywordMessage_text_prefix_idx").on(
      table.workspaceId,
      table.normalizedText.op("text_pattern_ops"),
    ),
  ],
)
