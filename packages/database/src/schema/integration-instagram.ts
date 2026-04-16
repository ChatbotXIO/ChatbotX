import { sql } from "drizzle-orm"
import { index, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import type {
  InstagramConversationStarter,
  InstagramPersistentMenu,
} from "../partials"
import { sharedColumns } from "../partials/shared"
import { flowModel } from "./flow"
import { inboxModel } from "./inbox"
import { workspaceModel } from "./workspace"

export const integrationInstagramModel = pgTable(
  "IntegrationInstagram",
  {
    ...sharedColumns,
    auth: jsonb().notNull(),
    igId: text().notNull(),
    pageId: text().notNull(),
    name: text().notNull(),
    username: text().notNull(),
    conversationStarters: jsonb()
      .$type<InstagramConversationStarter>()
      .array()
      .default(sql`[]`)
      .notNull(),
    persistentMenus: jsonb()
      .$type<InstagramPersistentMenu>()
      .array()
      .default(sql`[]`)
      .notNull(),
    workspaceId: text()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "IntegrationInstagram_workspaceId_fkey",
      }),
    inboxId: text()
      .notNull()
      .references(() => inboxModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "IntegrationInstagram_inboxId_fkey",
      }),
    welcomeFlowId: text().references(() => flowModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
      name: "IntegrationInstagram_welcomeFlowId_fkey",
    }),
  },
  (table) => [
    index("IntegrationInstagram_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    index("IntegrationInstagram_welcomeFlowId_idx").using(
      "btree",
      table.welcomeFlowId.asc().nullsLast(),
    ),
    uniqueIndex("IntegrationInstagram_inboxId_key").using(
      "btree",
      table.inboxId.asc().nullsLast(),
    ),
    uniqueIndex("IntegrationInstagram_igId_key").using(
      "btree",
      table.igId.asc().nullsLast(),
    ),
  ],
)
