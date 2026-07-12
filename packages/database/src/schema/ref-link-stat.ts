import { index, pgTable, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import { bigintAsString, timestampConfig } from "../partials/shared"
import { reflinkModel } from "./reflink"
import { workspaceModel } from "./workspace"

export const refLinkStatModel = pgTable(
  "RefLinkStat",
  {
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    linkId: bigintAsString()
      .notNull()
      .references(() => reflinkModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    contactId: bigintAsString().notNull(),
    contactInboxId: bigintAsString().notNull(),
    occurredAt: timestamp(timestampConfig).notNull(),
    createdAt: timestamp(timestampConfig).defaultNow().notNull(),
  },
  (table) => [
    index("RefLinkStat_contactId_idx").on(table.contactId),
    // Unique on the natural event key so worker re-deliveries dedupe via
    // onConflictDoNothing. The (workspaceId, linkId, occurredAt) prefix still
    // serves the date-range and per-contact aggregate queries.
    uniqueIndex(
      "RefLinkStat_workspaceId_linkId_occurredAt_contactInboxId_key",
    ).on(
      table.workspaceId,
      table.linkId,
      table.occurredAt,
      table.contactInboxId,
    ),
  ],
)
