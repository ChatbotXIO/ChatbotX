import { pgTable, timestamp, unique } from "drizzle-orm/pg-core"
import { bigintAsString, timestampConfig } from "../partials/shared"
import { magicLinkModel } from "./magic-link"
import { workspaceModel } from "./workspace"

export const magicLinkContactStatModel = pgTable(
  "MagicLinkContactStat",
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
    contactId: bigintAsString(),
    contactInboxId: bigintAsString().notNull(),
    occurredAt: timestamp(timestampConfig).notNull(),
    createdAt: timestamp(timestampConfig).defaultNow().notNull(),
  },
  (table) => [
    unique("MagicLinkContactStat_workspaceId_linkId_contactInboxId_idx").on(
      table.workspaceId,
      table.linkId,
      table.contactInboxId,
    ),
  ],
)
