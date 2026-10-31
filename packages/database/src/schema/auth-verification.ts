import { createId } from "@chatbotx.io/utils"
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { sharedColumns, timestampConfig } from "../partials/shared"

export const verificationModel = pgTable(
  "Verification",
  {
    ...sharedColumns,
    // Text, not bigint: Better Auth reserves rows with a deterministic base64url
    // id (`reserveVerificationValue`, used by magic-link cleanup) to get an
    // atomic single-use guarantee from the primary key.
    id: text()
      .primaryKey()
      .$defaultFn(() => createId()),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp(timestampConfig).notNull(),
  },
  (table) => [index("Verification_identifier_idx").on(table.identifier)],
)
