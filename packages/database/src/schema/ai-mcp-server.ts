import { sql } from "drizzle-orm"
import { jsonb, pgTable, text } from "drizzle-orm/pg-core"
import type { AIMcpServerAuth } from "../partials/ai"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { workspaceModel } from "./workspace"

export const aiMCPServerModel = pgTable("AIMCPServer", {
  ...sharedColumns,
  name: text().notNull(),
  url: text().notNull(),
  auth: jsonb().$type<AIMcpServerAuth>().notNull(),
  availableTools: jsonb().$type<{ [x: string]: unknown }>().notNull(),
  selectedTools: text().array().notNull().default(sql`[]`),
  workspaceId: bigintAsString()
    .notNull()
    .references(() => workspaceModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
})
