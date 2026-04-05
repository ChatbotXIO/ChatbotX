import { boolean, pgTable, text } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { organizationModel } from "./organization"

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
  organizationId: bigintAsString()
    .notNull()
    .references(() => organizationModel.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
  plan: text().notNull().default("free"),
  token: text(),
})
