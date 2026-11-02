import { sql } from "drizzle-orm"
import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
} from "drizzle-orm/pg-core"
import {
  automatedResponseTypes,
  type KeywordCondition,
} from "../partials/automated-response"
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
    // ManyChat-style match conditions. Every Contact (inbound) rule has them —
    // the migration turned older rules into one "contains" condition, matched
    // ignoring case and accents. Null only on Page (outbound) rules, which
    // match `keywords` exactly.
    conditions: jsonb().$type<KeywordCondition[]>(),
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
