import { type SQL, sql } from "drizzle-orm"
import {
  boolean,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import { bigintAsString, timestampConfig } from "../partials/shared"
import { broadcastModel } from "./broadcast"
import { contactModel } from "./contact"
import { contactInboxModel } from "./contact-inbox"
import { conversationModel } from "./conversation"

export const contactsOnBroadcastsModel = pgTable(
  "ContactOnBroadcast",
  {
    broadcastId: bigintAsString()
      .notNull()
      .references(() => broadcastModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    contactId: bigintAsString()
      .notNull()
      .references(() => contactModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    contactInboxId: bigintAsString()
      .notNull()
      .references(() => contactInboxModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    conversationId: bigintAsString()
      .notNull()
      .references(() => conversationModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    sent: boolean().default(false).notNull(),
    seenAt: timestamp(timestampConfig),
    deliveredAt: timestamp(timestampConfig),
    clickedAt: timestamp(timestampConfig),
    failedAt: timestamp(timestampConfig),
    errorContent: text(),
    isRead: boolean().generatedAlwaysAs(
      (): SQL =>
        sql`case when "seenAt" is null then false when "deliveredAt" is null then false else "seenAt" >= "deliveredAt" end`,
    ),
  },
  (table) => [
    primaryKey({
      columns: [table.broadcastId, table.contactId],
      name: "ContactsOnBroadcast_pkey",
    }),
    index("idx_contact_on_broadcast_contact_id").on(table.contactId),
    // Covers the `ContactInbox -> ContactOnBroadcast` ON DELETE CASCADE check.
    // Without it every ContactInbox delete (workspace purge, contact delete)
    // seq-scans all 64 partitions. Built per partition + ATTACH, see
    // drizzle/*_add_contact_inbox_fk_indexes/migration.sql.
    index("ContactOnBroadcast_contactInboxId_idx").on(table.contactInboxId),
    index("idx_contact_on_broadcast_is_read").on(table.isRead),
    // Speeds up the per-batch unsent-recipient scan
    // (broadcastId + sent=false + failedAt IS NULL) so it doesn't walk an
    // ever-growing sent prefix on million-row broadcasts. Re-keyed on
    // (broadcastId, contactInboxId) so a send-limit tick can read unsent
    // rows in contactInboxId order without a separate sort — an in-order
    // index range scan whether the broadcast has 1k or 10M recipients.
    // ContactOnBroadcast is HASH-partitioned into 64 tables, so drizzle-kit's
    // plain `index(...)` here cannot express how the migration actually
    // builds it: per partition (CREATE INDEX CONCURRENTLY on each of the 64
    // child tables), then ATTACH PARTITION onto an ON ONLY parent index —
    // see drizzle/20260920111706_broadcast_send_order_indexes/migration.sql.
    index("ContactOnBroadcast_unsent_order_idx")
      .on(table.broadcastId, table.contactInboxId)
      .where(sql`"sent" = false AND "failedAt" IS NULL`),
  ],
)
