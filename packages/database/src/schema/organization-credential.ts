import { index, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import type {
  OrganizationCredentialEncrypted,
  OrganizationCredentialPublicByType,
  OrganizationCredentialType,
} from "../partials/organization-credential"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { organizationModel } from "./organization"

export const organizationCredentialModel = pgTable(
  "OrganizationCredential",
  {
    ...sharedColumns,
    organizationId: bigintAsString()
      .notNull()
      .references(() => organizationModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    type: text().$type<OrganizationCredentialType>().notNull(),
    publicConfig: jsonb()
      .$type<OrganizationCredentialPublicByType[OrganizationCredentialType]>()
      .notNull(),
    value: jsonb().$type<OrganizationCredentialEncrypted>().notNull(),
  },
  (table) => [
    uniqueIndex("OrganizationCredential_organizationId_type_key").using(
      "btree",
      table.organizationId.asc().nullsLast(),
      table.type.asc().nullsLast(),
    ),
    index("OrganizationCredential_organizationId_idx").using(
      "btree",
      table.organizationId.asc().nullsLast(),
    ),
  ],
)
