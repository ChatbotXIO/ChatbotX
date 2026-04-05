import { pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { sharedColumns, timestampConfig } from "../partials/shared"

export const jwkModel = pgTable("Jwk", {
  ...sharedColumns,
  publicKey: text().notNull(),
  privateKey: text().notNull(),
  expiresAt: timestamp(timestampConfig),
})
