import { pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../../partials/shared"

export const platformAdminBootstrapModel = pgTable(
  "PlatformAdminBootstrap",
  {
    ...sharedColumns,
    bootstrapKey: text().notNull().default("platform-admin"),
    email: text().notNull(),
    userId: bigintAsString().notNull(),
  },
  (table) => [
    uniqueIndex("PlatformAdminBootstrap_bootstrapKey_key").on(
      table.bootstrapKey,
    ),
  ],
)
