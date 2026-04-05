import { sql } from "drizzle-orm"
import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
} from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { workspaceModel } from "./workspace"

export const aiAgentModel = pgTable("AIAgent", {
  ...sharedColumns,
  workspaceId: bigintAsString()
    .notNull()
    .references(() => workspaceModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  name: text().notNull(),
  prompt: text(),
  messages: jsonb().array().notNull().default(sql`[]`),
  isDefault: boolean().default(false).notNull(),
  tools: text().array().notNull().default(sql`[]`),
  models: jsonb().array().notNull().default(sql`[]`),
  temperature: doublePrecision().notNull(),
  maxOutputTokens: integer().notNull(),
})
