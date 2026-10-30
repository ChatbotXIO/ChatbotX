import { sql } from "drizzle-orm"
import { boolean, index, pgTable, text } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { userModel } from "./auth-user"
import { oauthApplicationModel } from "./oauth-application"
import { workspaceModel } from "./workspace"

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
    /**
     * Workspace the user picked on the consent screen. Every token the client
     * holds for this user acts on it, so a marketplace install needs no
     * workspace id in its URL. Null only on consents given before the picker
     * existed; deleting the workspace deletes the consent and, with it, the
     * client's access.
     */
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
