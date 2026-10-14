import { sql } from "drizzle-orm"
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import { genderTypes } from "../partials"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { workspaceModel } from "./workspace"

export const gender = pgEnum(
  "gender",
  genderTypes.options as [string, ...string[]],
)

/**
 * A name as an inbound webhook compares it: whitespace runs collapsed to one
 * space and trimmed, so `"John "` (a first name with an empty last name) and
 * `"John"` are the same name. Only ASCII whitespace counts — spelled out, because
 * `\s` depends on the database locale — and the webhook's extraction uses the
 * same set. The lookup and its index both use this.
 */
export const normalizedFullNameSql = (fullName: AnyPgColumn) =>
  sql`btrim(regexp_replace(${fullName}, '[ \\t\\n\\v\\f\\r]+', ' ', 'g'))`

export const contactModel = pgTable(
  "Contact",
  {
    ...sharedColumns,
    avatar: text(),
    phoneNumber: text(),
    email: text(),
    emailVerified: boolean().default(false).notNull(),
    emailOptIn: boolean().default(true).notNull(),
    firstName: text(),
    lastName: text(),
    fullName: text().generatedAlwaysAs(
      sql`CASE
        WHEN "firstName" IS NULL AND "lastName" IS NULL THEN NULL
        WHEN "firstName" IS NULL THEN "lastName"
        WHEN "lastName" IS NULL THEN "firstName"
        ELSE "firstName" || ' ' || "lastName"
      END`,
    ),
    gender: gender(),
    lastReadAt: timestamp(timestampConfig),
    ref: text(),
    country: text(),
    state: text(),
    city: text(),
    location: jsonb().$type<{
      latitude: number
      longitude: number
    }>(),
    locale: text(),
    timezone: text(),
    subscribedAt: timestamp(timestampConfig),
    broadcastSubscribedAt: timestamp(timestampConfig),
    blockedAt: timestamp(timestampConfig),
    totalTagged: integer().notNull().default(0),
    totalNewTagged: integer().notNull().default(0),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    index("idx_contact_broadcast_subscribed_at").on(
      table.broadcastSubscribedAt,
    ),
    index("idx_contact_workspace_created_at").on(
      table.workspaceId,
      table.createdAt,
    ),
    // Covers the identifier→id equality lookup used by
    // `packages/business/src/contact/utils.ts#parseContactIdentifier` for
    // the public API's `identifier: "email:..."/"phone:..."` syntax —
    // previously only the GIN trigram indexes existed, which are built for
    // substring/similarity search, not exact-match lookups.
    index("idx_contact_workspace_email").on(table.workspaceId, table.email),
    index("idx_contact_workspace_phone_number").on(
      table.workspaceId,
      table.phoneNumber,
    ),
    // Exact full-name lookup of an inbound webhook that identifies a contact by
    // name (`ContactInbox` is joined on the inbox, this narrows the candidates).
    // Indexed by digest: a name can be arbitrarily long, and a B-tree entry
    // over 2.7 KB would fail the write that stored it.
    index("idx_contact_workspace_full_name_md5").on(
      table.workspaceId,
      sql`md5(${normalizedFullNameSql(table.fullName)})`,
    ),
    index("Contact_firstName_trgm_idx").using(
      "gin",
      table.firstName.op("gin_trgm_ops"),
    ),
    index("Contact_lastName_trgm_idx").using(
      "gin",
      table.lastName.op("gin_trgm_ops"),
    ),
    index("Contact_email_trgm_idx").using(
      "gin",
      table.email.op("gin_trgm_ops"),
    ),
    index("Contact_phoneNumber_trgm_idx").using(
      "gin",
      table.phoneNumber.op("gin_trgm_ops"),
    ),
  ],
)
