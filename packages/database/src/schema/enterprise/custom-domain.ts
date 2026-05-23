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

export const customDomainModel = pgTable(
  "CustomDomain",
  {
    ...sharedColumns,
    userId: bigintAsString().notNull(),
    domain: text().notNull(),
    status: text().notNull().default("pending"), // 'pending' | 'active' | 'failed'
    txtRecord: text().notNull(),
    verifiedAt: timestamp(timestampConfig),
  },
  (table) => [
    uniqueIndex("CustomDomain_userId_key").on(table.userId),
    uniqueIndex("CustomDomain_domain_key").on(table.domain),
    index("CustomDomain_status_idx").on(table.status),
  ],
)
