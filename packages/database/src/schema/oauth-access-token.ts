import {
  index,
  jsonb,
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
import { sessionModel } from "./auth-session"
import { userModel } from "./auth-user"
import { oauthClientModel } from "./oauth-client"
import { oauthRefreshTokenModel } from "./oauth-refresh-token"

export const oauthAccessTokenModel = pgTable(
  "OAuthAccessToken",
  {
    ...sharedColumns,
    token: text().notNull(),
    clientId: text()
      .notNull()
      .references(() => oauthClientModel.clientId, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    sessionId: bigintAsString().references(() => sessionModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    userId: bigintAsString().references(() => userModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    referenceId: text(),
    authorizationCodeId: text(),
    resources: text().array(),
    requestedUserInfoClaims: text().array(),
    refreshId: bigintAsString().references(() => oauthRefreshTokenModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    expiresAt: timestamp(timestampConfig).notNull(),
    revoked: timestamp(timestampConfig),
    confirmation: jsonb().$type<Record<string, unknown>>(),
    scopes: text().array().notNull(),
  },
  (table) => [
    uniqueIndex("OAuthAccessToken_token_key").on(table.token),
    index("OAuthAccessToken_clientId_idx").on(table.clientId),
    index("OAuthAccessToken_sessionId_idx").on(table.sessionId),
    index("OAuthAccessToken_userId_idx").on(table.userId),
    index("OAuthAccessToken_authorizationCodeId_idx").on(
      table.authorizationCodeId,
    ),
    index("OAuthAccessToken_refreshId_idx").on(table.refreshId),
  ],
)
