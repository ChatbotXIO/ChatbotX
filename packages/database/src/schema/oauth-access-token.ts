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
import { oauthApplicationModel } from "./oauth-application"

export const oauthAccessTokenModel = pgTable(
  "OAuthAccessToken",
  {
    ...sharedColumns,
    accessToken: text().notNull(),
    refreshToken: text().notNull(),
    accessTokenExpiresAt: timestamp(timestampConfig).notNull(),
    refreshTokenExpiresAt: timestamp(timestampConfig).notNull(),
    clientId: text()
      .notNull()
      .references(() => oauthApplicationModel.clientId, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    userId: bigintAsString().references(() => userModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    scopes: text().notNull(),
  },
  (table) => [
    uniqueIndex("OAuthAccessToken_accessToken_key").on(table.accessToken),
    uniqueIndex("OAuthAccessToken_refreshToken_key").on(table.refreshToken),
    index("OAuthAccessToken_userId_idx").on(table.userId),
  ],
)
