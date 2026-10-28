import { sql } from "drizzle-orm"
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { z } from "zod"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { contactInboxModel } from "./contact-inbox"
import { workspaceModel } from "./workspace"

export const contactReferralEventProviderSchema = z.enum(["meta", "google"])
export type ContactReferralEventProvider = z.infer<
  typeof contactReferralEventProviderSchema
>

// Only "ad" is written today; the other types are reserved by the CHECK below.
type ContactReferralEventType = "ad" | "refLink" | "shortLink" | "qr"
type ContactReferralClickIdType = "ctwa" | "gclid" | "gbraid"

/** Provider detail of the touch that has no column of its own. */
type ContactReferralEventMetadata = {
  adTitle?: string | null
  adBody?: string | null
  sourcePlatform?: string | null
}

/**
 * Append-only log of every referral a contact arrived through. Unlike
 * `ContactInbox.referral` (a mutable snapshot of the LAST touch), each row is a
 * full snapshot of one touch and is never merged with an older one. Only
 * `type = "ad"` is written today; `refLink`/`shortLink`/`qr` are reserved.
 */
export const contactReferralEventModel = pgTable(
  "ContactReferralEvent",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    // No FK: the `contactInboxId` cascade already removes the row when the
    // contact (or its inbox) is deleted.
    contactId: bigintAsString().notNull(),
    contactInboxId: bigintAsString()
      .notNull()
      .references(() => contactInboxModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    channel: text().notNull(),
    type: text().$type<ContactReferralEventType>().notNull(),
    provider: text().$type<ContactReferralEventProvider>(),
    // When the touch reached us: the time the carrying message was stored, or
    // the webhook event time for a referral-only event. Never the moment the
    // user clicked the ad (for a Google click, the message that carried it).
    occurredAt: timestamp(timestampConfig).notNull(),
    // Text, not bigint: nullable (a Zalo Google click carries no ad id) and
    // provider-owned.
    adId: text(),
    campaignId: text(),
    adGroupId: text(),
    clickIdType: text().$type<ContactReferralClickIdType>(),
    clickId: text(),
    ref: text(),
    source: text(),
    sourceUrl: text(),
    metadata: jsonb().$type<ContactReferralEventMetadata>(),
    // Retry identity. Click id when the touch has one, else ad id + the
    // carrying event's key — never ad id alone, or repeat clicks would collapse.
    dedupKey: text().notNull(),
  },
  (table) => [
    uniqueIndex(
      "ContactReferralEvent_workspaceId_contactInboxId_dedupKey_key",
    ).on(table.workspaceId, table.contactInboxId, table.dedupKey),
    index("ContactReferralEvent_contactInboxId_idx").using(
      "btree",
      table.contactInboxId.asc().nullsLast(),
    ),
    index("ContactReferralEvent_workspaceId_contactId_occurredAt_idx").on(
      table.workspaceId,
      table.contactId,
      table.occurredAt,
    ),
    // Recent ads of a workspace (filter picker) and ad reports over a date
    // range: both walk this index by time and stop early.
    index("ContactReferralEvent_workspaceId_type_occurredAt_idx")
      .on(table.workspaceId, table.type, table.occurredAt)
      .where(sql`${table.adId} IS NOT NULL`),
    check(
      "ContactReferralEvent_type_check",
      sql`"type" IN ('ad', 'refLink', 'shortLink', 'qr')`,
    ),
    check(
      "ContactReferralEvent_provider_check",
      sql`"provider" IS NULL OR "provider" IN ('meta', 'google')`,
    ),
    check(
      "ContactReferralEvent_clickIdType_check",
      sql`"clickIdType" IS NULL OR "clickIdType" IN ('ctwa', 'gclid', 'gbraid')`,
    ),
    check(
      "ContactReferralEvent_clickId_check",
      sql`("clickId" IS NULL) = ("clickIdType" IS NULL)`,
    ),
  ],
)
