import { pgTable, text, timestamp } from "drizzle-orm/pg-core"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { userModel } from "./auth-user"

export const accountModel = pgTable("Account", {
  ...sharedColumns,
  accountId: text().notNull(),
  providerId: text().notNull(),
  accessToken: text(),
  accessTokenExpiresAt: timestamp(timestampConfig),
  refreshToken: text(),
  refreshTokenExpiresAt: timestamp(timestampConfig),
  scope: text(),
  idToken: text(),
  password: text(),
  userId: bigintAsString()
    .notNull()
    .references(() => userModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
})
