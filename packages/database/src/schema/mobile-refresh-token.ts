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
} from "../partials/shared"
import { userModel } from "./auth-user"

/**
 * Opaque, rotating refresh token for the native mobile app (grant
 * `refresh_token` of `POST /api/auth/mobile/token`). Only the SHA-256 hash is
 * stored. Every use rotates: the presented row is stamped `rotatedAt` and a
 * successor row is inserted in the same `familyId`. Presenting a row that is
 * already rotated or revoked is a replay, which revokes the whole family.
 */
export const mobileRefreshTokenModel = pgTable(
  "MobileRefreshToken",
  {
    ...sharedColumns,
    userId: bigintAsString()
      .notNull()
      .references(() => userModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    deviceId: text().notNull(),
    // One login = one family; rotation keeps the family, reuse revokes it.
    familyId: text().notNull(),
    tokenHash: text().notNull(),
    expiresAt: timestamp(timestampConfig).notNull(),
    rotatedAt: timestamp(timestampConfig),
    revoked: timestamp(timestampConfig),
  },
  (table) => [
    uniqueIndex("MobileRefreshToken_tokenHash_key").on(table.tokenHash),
    index("MobileRefreshToken_userId_idx").on(table.userId),
    index("MobileRefreshToken_familyId_rotatedAt_idx").on(
      table.familyId,
      table.rotatedAt,
    ),
    index("MobileRefreshToken_expiresAt_idx").on(table.expiresAt),
  ],
)
