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
import { userModel } from "../auth-user"

export const customDomainModel = pgTable(
  "CustomDomain",
  {
    ...sharedColumns,
    userId: bigintAsString()
      .notNull()
      .references(() => userModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    domain: text().notNull(),
    status: text().notNull().default("pending"), // 'pending' | 'active' | 'failed'
    verifiedAt: timestamp(timestampConfig),
  },
  (table) => [
    uniqueIndex("CustomDomain_userId_key").on(table.userId),
    uniqueIndex("CustomDomain_domain_key").on(table.domain),
    index("CustomDomain_status_idx").on(table.status),
  ],
)
