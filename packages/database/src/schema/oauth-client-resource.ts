import { index, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import { sharedColumns } from "../partials/shared"
import { oauthClientModel } from "./oauth-client"
import { oauthResourceModel } from "./oauth-resource"

export const oauthClientResourceModel = pgTable(
  "OAuthClientResource",
  {
    ...sharedColumns,
    clientId: text()
      .notNull()
      .references(() => oauthClientModel.clientId, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    resourceId: text()
      .notNull()
      .references(() => oauthResourceModel.identifier, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    metadata: jsonb().$type<Record<string, unknown>>(),
  },
  (table) => [
    index("OAuthClientResource_clientId_idx").on(table.clientId),
    index("OAuthClientResource_resourceId_idx").on(table.resourceId),
    uniqueIndex("OAuthClientResource_clientId_resourceId_key").on(
      table.clientId,
      table.resourceId,
    ),
  ],
)
