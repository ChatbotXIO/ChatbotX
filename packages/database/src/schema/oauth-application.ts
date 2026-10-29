import { boolean, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { userModel } from "./auth-user"

export const oauthApplicationModel = pgTable(
  "OAuthApplication",
  {
    ...sharedColumns,
    name: text().notNull(),
    icon: text(),
    metadata: text(),
    clientId: text().notNull(),
    clientSecret: text(),
    redirectUrls: text().notNull(),
    type: text().notNull(),
    disabled: boolean().notNull().default(false),
    userId: bigintAsString().references(() => userModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  },
  (table) => [uniqueIndex("OAuthApplication_clientId_key").on(table.clientId)],
)
