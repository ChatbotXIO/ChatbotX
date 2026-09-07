import type { EncryptedData } from "@chatbotx.io/encryption"
import { sql } from "drizzle-orm"
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { userModel } from "./auth-user"
import { workspaceModel } from "./workspace"

export const whatsappSignupSessionModel = pgTable(
  "WhatsappSignupSession",
  {
    ...sharedColumns,
    userId: bigintAsString()
      .notNull()
      .references(() => userModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    ownerId: bigintAsString()
      .notNull()
      .references(() => userModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    workspaceId: bigintAsString().references(() => workspaceModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    wabaId: text().notNull(),
    businessId: text().notNull(),
    encryptedAccessToken: jsonb().$type<EncryptedData>().notNull(),
    apiVersion: text().notNull(),
    candidatePhoneNumberIds: text().array().notNull(),
    // Phone numbers already claimed via `claimSignupSessionPhoneNumber` (the
    // per-number atomic UPDATE — see that repository method). Grows one id at
    // a time as each number's connect transaction commits; `consumedAt` is
    // stamped once this equals `candidatePhoneNumberIds` in length (every
    // offered number has been claimed).
    claimedPhoneNumberIds: text().array().notNull().default([]),
    expiresAt: timestamp(timestampConfig).notNull(),
    consumedAt: timestamp(timestampConfig),
  },
  (table) => [
    index("WhatsappSignupSession_userId_idx").using(
      "btree",
      table.userId.asc().nullsLast(),
    ),
    index("WhatsappSignupSession_expiresAt_idx").using(
      "btree",
      table.expiresAt.asc().nullsLast(),
    ),
    check(
      "WhatsappSignupSession_candidates_not_empty",
      sql`cardinality("candidatePhoneNumberIds") > 0`,
    ),
  ],
)
