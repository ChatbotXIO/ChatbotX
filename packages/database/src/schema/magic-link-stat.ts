import { index, pgTable, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import { bigintAsString, timestampConfig } from "../partials/shared"
import { magicLinkModel } from "./magic-link"
import { workspaceModel } from "./workspace"

export const magicLinkStatModel = pgTable(
  "MagicLinkStat",
  {
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    linkId: bigintAsString()
      .notNull()
      .references(() => magicLinkModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    contactId: bigintAsString().notNull(),
    contactInboxId: bigintAsString().notNull(),
    occurredAt: timestamp(timestampConfig).notNull(),
    createdAt: timestamp(timestampConfig).defaultNow().notNull(),
  },
  (table) => [
    // A contact's magic links newest first (the inbox "Opted In through"
    // list): one range per contact instead of a scan of the workspace's stats.
    // Built CONCURRENTLY by its own migration (MagicLinkStat is a hot insert
    // path); `DESC NULLS FIRST` is what a plain `DESC` index renders as.
    index("MagicLinkStat_workspaceId_contactId_occurredAt_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.contactId.asc().nullsLast(),
      table.occurredAt.desc().nullsFirst(),
    ),
    // Unique on the natural event key so worker re-deliveries dedupe via
    // onConflictDoNothing. The (workspaceId, linkId, occurredAt) prefix still
    // serves the date-range and per-contact aggregate queries.
    uniqueIndex(
      "MagicLinkStat_workspaceId_linkId_occurredAt_contactInboxId_key",
    ).on(
      table.workspaceId,
      table.linkId,
      table.occurredAt,
      table.contactInboxId,
    ),
  ],
)
