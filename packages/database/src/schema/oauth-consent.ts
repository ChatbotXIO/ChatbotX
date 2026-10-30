import { sql } from "drizzle-orm"
import { index, pgTable, text } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { userModel } from "./auth-user"
import { oauthClientModel } from "./oauth-client"
import { workspaceModel } from "./workspace"

export const oauthConsentModel = pgTable(
  "OAuthConsent",
  {
    ...sharedColumns,
    clientId: text()
      .notNull()
      .references(() => oauthClientModel.clientId, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    userId: bigintAsString().references(() => userModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    referenceId: text(),
    resources: text().array(),
    requestedUserInfoClaims: text().array(),
    scopes: text().array().notNull(),
    workspaceId: bigintAsString().references(() => workspaceModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  },
  (table) => [
    index("OAuthConsent_clientId_idx").on(table.clientId),
    index("OAuthConsent_userId_idx").on(table.userId),
    index("OAuthConsent_workspaceId_idx")
      .on(table.workspaceId)
      .where(sql`${table.workspaceId} IS NOT NULL`),
  ],
)
