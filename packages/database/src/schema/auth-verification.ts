import { createId } from "@chatbotx.io/utils"
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { sharedColumns, timestampConfig } from "../partials/shared"

export const verificationModel = pgTable(
  "Verification",
  {
    ...sharedColumns,
    id: text()
      .primaryKey()
      .$defaultFn(() => createId()),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp(timestampConfig).notNull(),
  },
  (table) => [index("Verification_identifier_idx").on(table.identifier)],
)
