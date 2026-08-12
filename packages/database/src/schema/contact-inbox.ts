import { sql } from "drizzle-orm"
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { lastUserInputTypes } from "../partials/message"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { contactModel } from "./contact"
import { inboxModel } from "./inbox"

export type ContactInboxReferral = {
  ref?: string | null
  source?: string | null
  type?: string | null
  adId?: string | null
  adTitle?: string | null
  sourceUrl?: string | null
  sourcePlatform?: string | null
  ctwaClid?: string | null
  postId?: string | null
  photoUrl?: string | null
  videoUrl?: string | null
  productId?: string | null
  flowId?: string | null
  raw?: Record<string, unknown>
}

export const lastUserInputTypeEnum = pgEnum(
  "lastUserInputType",
  lastUserInputTypes.options as [string, ...string[]],
)

export const contactInboxModel = pgTable(
  "ContactInbox",
  {
    ...sharedColumns,
    originalContactId: bigintAsString().notNull(),
    contactId: bigintAsString()
      .notNull()
      .references(() => contactModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    inboxId: bigintAsString()
      .notNull()
      .references(() => inboxModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    channel: text().notNull(),
    source: text().notNull(),
    sourceId: text().notNull(),
    language: text(),
    // Local persona id (MessengerPersona.id) chosen for this contact connection
    // via the "Set Persona" flow action. Resolved to the page's current Facebook
    // persona id at send time; null means the page default persona is used.
    personaId: text(),
    contactLastReadAt: timestamp(timestampConfig),
    firstInteractionAt: timestamp(timestampConfig),
    lastMessageAt: timestamp(timestampConfig),
    lastIncomingMessageAt: timestamp(timestampConfig),
    lastOutboundMessageAt: timestamp(timestampConfig),
    referral: jsonb().$type<ContactInboxReferral>(),
    lastCommentMessageId: text(),
    lastCommentMessageAt: timestamp(timestampConfig),
    consecutiveFailedReply: integer().default(0).notNull(),
    lastInputFailure: text(),
    lastErrorLog: text(),
    lastBtnTitle: text(),
    lastUserInput: text(),
    lastUserInputType: lastUserInputTypeEnum(),
    webchatParentUrl: text(),
  },
  (table) => [
    uniqueIndex("ContactInbox_inboxId_sourceId_key").using(
      "btree",
      table.inboxId.asc().nullsLast(),
      table.sourceId.asc().nullsLast(),
    ),
    index("ContactInbox_contactId_lastIncomingMessageAt_idx").using(
      "btree",
      table.contactId.asc().nullsLast(),
      table.lastIncomingMessageAt.asc().nullsLast(),
    ),
    index("ContactInbox_contactId_lastOutboundMessageAt_idx").using(
      "btree",
      table.contactId.asc().nullsLast(),
      table.lastOutboundMessageAt.asc().nullsLast(),
    ),
    index("ContactInbox_referral_ctwaClid_idx")
      .using("btree", sql`(${table.referral}->>'ctwaClid')`)
      .where(sql`${table.referral}->>'ctwaClid' IS NOT NULL`),
  ],
)
