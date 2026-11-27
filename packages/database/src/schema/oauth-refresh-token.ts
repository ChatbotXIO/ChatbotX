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

export const oauthRefreshTokenModel = pgTable(
  "OAuthRefreshToken",
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
    userId: bigintAsString()
      .notNull()
      .references(() => userModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    referenceId: text(),
    authorizationCodeId: text(),
    resources: text().array(),
    requestedUserInfoClaims: text().array(),
    expiresAt: timestamp(timestampConfig).notNull(),
    revoked: timestamp(timestampConfig),
    rotatedAt: timestamp(timestampConfig),
    rotationReplayResponse: text(),
    rotationReplayExpiresAt: timestamp(timestampConfig),
    authTime: timestamp(timestampConfig),
    confirmation: jsonb().$type<Record<string, unknown>>(),
    scopes: text().array().notNull(),
  },
  (table) => [
    uniqueIndex("OAuthRefreshToken_token_key").on(table.token),
    index("OAuthRefreshToken_clientId_idx").on(table.clientId),
    index("OAuthRefreshToken_sessionId_idx").on(table.sessionId),
    index("OAuthRefreshToken_userId_idx").on(table.userId),
    index("OAuthRefreshToken_authorizationCodeId_idx").on(
      table.authorizationCodeId,
    ),
  ],
)
