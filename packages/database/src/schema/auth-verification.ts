import { pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { sharedColumns, timestampConfig } from "../partials/shared"

export const verificationModel = pgTable("Verification", {
  ...sharedColumns,
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: timestamp(timestampConfig).notNull(),
})
