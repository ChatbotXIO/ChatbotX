import { sql } from "drizzle-orm"
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { sharedColumns, timestampConfig } from "../partials/shared"

/**
 * Buffers raw WhatsApp Coexistence history webhook payloads until the user
 * confirms the post-connect popup. Meta pushes contacts + up to 6 months of
 * chat history over up to 6 hours after onboarding — this table holds those
 * payloads so no contact reaches billing tables before explicit confirmation.
 *
 * `payloadHash` is a content fingerprint set by the buffer handler so duplicate
 * webhook deliveries collapse to one row via the unique index. `processedAt`
 * is set once the flush handler imports the row; old processed rows are
 * eligible for purge by a maintenance job.
 */
export const whatsappCoexistStagingModel = pgTable(
  "WhatsappCoexistStaging",
  {
    ...sharedColumns,
    phoneNumberId: text().notNull(),
    payload: jsonb().notNull(),
    payloadHash: text().notNull(),
    processedAt: timestamp(timestampConfig),
    // Set when the flush could not parse the payload at all (a Meta schema
    // change). Such a row is NOT marked processed — it is excluded from every
    // batch query so it cannot poison a run, kept for 7 days so the payload can
    // be inspected, then purged. Nullable, no default (AGENTS.md invariant 11).
    parseFailedAt: timestamp(timestampConfig),
  },
  (table) => [
    index("WhatsappCoexistStaging_phoneNumberId_idx").using(
      "btree",
      table.phoneNumberId.asc().nullsLast(),
    ),
    uniqueIndex("WhatsappCoexistStaging_phone_hash_uq").using(
      "btree",
      table.phoneNumberId.asc().nullsLast(),
      table.payloadHash.asc().nullsLast(),
    ),
    index("WhatsappCoexistStaging_processedAt_idx")
      .using("btree", table.processedAt.asc().nullsLast())
      .where(sql`"processedAt" IS NOT NULL`),
    // Powers the 7-day purge of poison rows.
    index("WhatsappCoexistStaging_parseFailedAt_idx")
      .using("btree", table.parseFailedAt.asc().nullsLast())
      .where(sql`"parseFailedAt" IS NOT NULL`),
  ],
)
