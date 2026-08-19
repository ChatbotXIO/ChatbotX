import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { inboxModel } from "./inbox"
import { workspaceModel } from "./workspace"

export const integrationApiModel = pgTable(
  "IntegrationApi",
  {
    ...sharedColumns,
    auth: jsonb().$type<{ [x: string]: unknown }>().notNull(),
    name: text().notNull(),
    tokenHash: text().notNull(),
    tokenPrefix: text().notNull(),
    callbackUrl: text(),
    enabled: boolean().notNull().default(true),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    inboxId: bigintAsString()
      .notNull()
      .references(() => inboxModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    index("IntegrationApi_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    uniqueIndex("IntegrationApi_inboxId_key").using(
      "btree",
      table.inboxId.asc().nullsLast(),
    ),
    uniqueIndex("IntegrationApi_tokenHash_key").using(
      "btree",
      table.tokenHash.asc().nullsLast(),
    ),
  ],
)
