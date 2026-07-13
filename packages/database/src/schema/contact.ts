import { sql } from "drizzle-orm"
import {
  boolean,
  index,
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
