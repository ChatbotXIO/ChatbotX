import {
  index,
  pgEnum,
  pgTable,
  primaryKey,
  timestamp,
} from "drizzle-orm/pg-core"
import { type ContactInfoType, contactInfoTypes } from "../partials/contact"
import {
  type ContactInfoSourceType,
  contactInfoSourceTypes,
} from "../partials/contact-info-capture"
import { bigintAsString, timestampConfig } from "../partials/shared"

export const contactInfoSourceTypeEnum = pgEnum(
  "contactInfoSourceType",
  contactInfoSourceTypes.options as [
    ContactInfoSourceType,
    ...ContactInfoSourceType[],
  ],
)

export const contactInfoTypeEnum = pgEnum(
  "contactInfoType",
  contactInfoTypes.options as [ContactInfoType, ...ContactInfoType[]],
)

// Partitioned by HASH(workspaceId) in its migration, with no FKs, like
// ContactActivity: a single-column cascade would probe every partition.
// Contact deletion, broadcast purge and workspace purge remove rows
// explicitly. One row means "this contact left this kind of info after this
// source"; the primary key is the idempotency key. Only ids, the info type and
// the time are stored, never the phone number or the email.
export const contactInfoCaptureModel = pgTable(
  "ContactInfoCapture",
  {
    workspaceId: bigintAsString().notNull(),
    sourceType: contactInfoSourceTypeEnum().notNull(),
    sourceId: bigintAsString().notNull(),
    infoType: contactInfoTypeEnum().notNull(),
    contactId: bigintAsString().notNull(),
    contactInboxId: bigintAsString().notNull(),
    inboxId: bigintAsString().notNull(),
    conversationId: bigintAsString().notNull(),
    // When the contact sent the message, not when it was processed.
    createdAt: timestamp(timestampConfig).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.workspaceId,
        table.sourceType,
        table.sourceId,
        table.infoType,
        table.contactId,
      ],
      name: "ContactInfoCapture_pkey",
    }),
    index("ContactInfoCapture_source_idx").on(
      table.workspaceId,
      table.sourceType,
      table.sourceId,
      table.infoType,
      table.createdAt.desc(),
      table.contactId.desc(),
    ),
    index("ContactInfoCapture_contact_idx").on(
      table.workspaceId,
      table.contactId,
    ),
  ],
)
