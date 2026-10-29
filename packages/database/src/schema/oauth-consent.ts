import { boolean, index, pgTable, text } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { userModel } from "./auth-user"
import { oauthApplicationModel } from "./oauth-application"

export const oauthConsentModel = pgTable(
  "OAuthConsent",
  {
    ...sharedColumns,
    clientId: text()
      .notNull()
      .references(() => oauthApplicationModel.clientId, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    userId: bigintAsString()
      .notNull()
      .references(() => userModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    scopes: text().notNull(),
    consentGiven: boolean().notNull(),
  },
  (table) => [
    index("OAuthConsent_clientId_idx").on(table.clientId),
    index("OAuthConsent_userId_idx").on(table.userId),
  ],
)
