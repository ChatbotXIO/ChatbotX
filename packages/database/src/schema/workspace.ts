import { boolean, pgTable, text } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { userModel } from "./auth-user"

export const workspaceModel = pgTable("Workspace", {
  ...sharedColumns,
  name: text().notNull(),
  defaultReply: text(),
  targetCountry: text(),
  language: text().notNull().default("en"),
  timezone: text().notNull().default("UTC"),
  brandColor: text().notNull().default("#016DFF"),
  developmentMode: boolean().default(false).notNull(),
  logo: text(),
  ownerId: bigintAsString()
    .notNull()
    .references(() => userModel.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
  token: text(),
})
