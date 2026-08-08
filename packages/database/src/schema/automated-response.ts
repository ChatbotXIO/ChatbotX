import { sql } from "drizzle-orm"
import { boolean, index, pgEnum, pgTable, text } from "drizzle-orm/pg-core"
import { automatedResponseTypes } from "../partials/automated-response"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { flowModel } from "./flow"
import { folderModel } from "./folder"
import { workspaceModel } from "./workspace"

export const automatedResponseType = pgEnum(
  "automatedResponseType",
  automatedResponseTypes.options as [string, ...string[]],
)

export const automatedResponseModel = pgTable(
  "AutomatedResponse",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    folderId: bigintAsString().references(() => folderModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    keywords: text().array().notNull().default(sql`[]`),
    status: boolean().notNull(),
    text: text(),
    flowId: bigintAsString().references(() => flowModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    type: automatedResponseType().default("inbound").notNull(),
  },
  (table) => [
    index("AutomatedResponse_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
  ],
)
