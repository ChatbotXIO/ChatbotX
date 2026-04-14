import { pgTable, timestamp, unique } from "drizzle-orm/pg-core"
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
    unique("MagicLinkStat_workspaceId_linkId_contactInboxId_occurredAt_idx").on(
      table.workspaceId,
      table.linkId,
      table.contactInboxId,
      table.occurredAt,
    ),
  ],
)
