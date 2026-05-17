import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import type { OrganizationSettings } from "../partials/organization"
import { sharedColumns } from "../partials/shared"

export const organizationModel = pgTable(
  "Organization",
  {
    ...sharedColumns,
    name: text().notNull(),
    slug: text(),
    logo: text(),
    metadata: text(),
    domain: text(),
    appUrl: text(),
    wsUrl: text(),
    assetUrl: text(),
    supportEmail: text(),
    // @deprecated
    settings: jsonb().$type<OrganizationSettings>().default({}).notNull(),
    defaultMaxContacts: integer().default(999_999_999).notNull(),
  },
  (table) => [
    index("Organization_domain_idx").using(
      "btree",
      table.domain.asc().nullsLast(),
    ),
    uniqueIndex("Organization_slug_key").using(
      "btree",
      table.slug.asc().nullsLast(),
    ),
  ],
)
