import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../../partials/shared"
import { tenantModel } from "./tenant"

export const customDomainModel = pgTable(
  "CustomDomain",
  {
    ...sharedColumns,
    // The tenant this domain serves. Host → tenant is the white-label routing key.
    tenantId: bigintAsString()
      .notNull()
      .references(() => tenantModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    domain: text().notNull(),
    status: text().notNull().default("pending"), // 'pending' | 'active' | 'failed'
    verifiedAt: timestamp(timestampConfig),
    cfHostnameId: text(),
    cfOwnershipValue: text(),
    cfAcmeValue: text(),
  },
  (table) => [
    uniqueIndex("CustomDomain_tenantId_key").on(table.tenantId),
    uniqueIndex("CustomDomain_domain_key").on(table.domain),
    index("CustomDomain_status_idx").on(table.status),
  ],
)
