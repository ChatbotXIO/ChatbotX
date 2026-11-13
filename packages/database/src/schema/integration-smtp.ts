import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { inboxModel } from "./inbox"
import { workspaceModel } from "./workspace"

export const integrationSmtpModel = pgTable(
  "IntegrationSmtp",
  {
    ...sharedColumns,
    auth: jsonb().notNull(),
    name: text().notNull(),
    fromAddress: text().notNull(),
    // Receiving mail by IMAP polling. `imapEnabled` has a real DB default so
    // rows that predate the column read as "off".
    imapEnabled: boolean().notNull().default(false),
    imapHost: text(),
    imapPort: integer(),
    imapMailbox: text(),
    // Poll cursor: UIDs are only comparable within one UIDVALIDITY epoch.
    imapUidValidity: bigint({ mode: "number" }),
    imapLastUid: bigint({ mode: "number" }),
    lastPolledAt: timestamp(timestampConfig),
    lastPollError: text(),
    // Earliest next poll; pushed out after a failure (back-off) and null when due.
    imapNextPollAt: timestamp(timestampConfig),
    // Secret path segment of the inbound-parse webhook URL (relay providers).
    // Stored as-is, not hashed: the user must be able to copy the URL again.
    inboundToken: text(),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    inboxId: bigintAsString()
      .notNull()
      .references(() => inboxModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    index("IntegrationSmtp_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    uniqueIndex("IntegrationSmtp_inboxId_key").on(table.inboxId),
    uniqueIndex("IntegrationSmtp_inboundToken_key").on(table.inboundToken),
    // Serves the due-poll scan, which rotates by least-recently-polled.
    index("IntegrationSmtp_imapEnabled_lastPolledAt_idx")
      .using("btree", table.lastPolledAt.asc().nullsFirst())
      .where(sql`${table.imapEnabled}`),
  ],
)
