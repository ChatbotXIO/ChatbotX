import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import type { OrganizationSettings } from "../partials/organization"
import { sharedColumns } from "../partials/shared"
import { userModel } from "./auth"

export const organizationModel = pgTable(
  "organizations",
  {
    ...sharedColumns,
    name: text("name").notNull(),
    slug: text("slug"),
    logo: text("logo"),
    metadata: text("metadata"),
    domain: text("domain"),
    supportEmail: text("support_email"),
    settings: jsonb("settings")
      .$type<OrganizationSettings>()
      .default({})
      .notNull(),
    defaultMaxContacts: integer("default_max_contacts")
      .default(999_999_999)
      .notNull(),
  },
  (table) => [
    index("organizations_domain_idx").using(
      "btree",
      table.domain.asc().nullsLast(),
    ),
    uniqueIndex("organizations_slug_key").using(
      "btree",
      table.slug.asc().nullsLast(),
    ),
  ],
)

export const organizationMemberModel = pgTable("organization_members", {
  ...sharedColumns,
  role: text("role").notNull(),
  organizationId: bigint("organization_id", { mode: "bigint" })
    .notNull()
    .references(() => organizationModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  userId: bigint("user_id", { mode: "bigint" })
    .notNull()
    .references(() => userModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
})
