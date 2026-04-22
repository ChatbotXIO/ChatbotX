import { sql } from "drizzle-orm"
import {
  index,
  pgTable,
  primaryKey,
  smallint,
  timestamp,
} from "drizzle-orm/pg-core"
import { bigintAsString, timestampConfig } from "../partials/shared"

export const contactActivityHourlyModel = pgTable(
  "ContactActivityHourly",
  {
    workspaceId: bigintAsString().notNull(),
    contactId: bigintAsString().notNull(),
    contactInboxId: bigintAsString().notNull(),
    eventType: smallint().notNull(),
    inboxId: bigintAsString().notNull(),
    hourBucket: timestamp(timestampConfig).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.hourBucket,
        table.workspaceId,
        table.contactInboxId,
        table.eventType,
        table.inboxId,
      ],
    }),
    index("ContactActivityHourly_brin").using(
      "brin",
      sql`"workspaceId", "hourBucket"`,
    ),
  ],
)

export const MAC_EVENT_TYPE = {
  MESSAGE_IN: 1,
  MESSAGE_OUT: 2,
  REACTION: 3,
} as const

export type MacEventType = (typeof MAC_EVENT_TYPE)[keyof typeof MAC_EVENT_TYPE]
