import { sql } from "drizzle-orm"
import { index, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import type {
  MessengerConversationStarter,
  MessengerPersistentMenu,
  MessengerPersona,
} from "../partials/integration-messenger"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { flowModel } from "./flow"
import { inboxModel } from "./inbox"
import { workspaceModel } from "./workspace"

export const integrationMessengerModel = pgTable(
  "IntegrationMessenger",
  {
    ...sharedColumns,
    auth: jsonb().notNull(),
    pageId: text().notNull(),
    name: text().notNull(),
    conversationStarters: jsonb()
      .$type<MessengerConversationStarter[]>()
      .default(sql`[]`)
      .notNull(),
    persistentMenus: jsonb()
      .$type<MessengerPersistentMenu[]>()
      .default(sql`[]`)
      .notNull(),
    personas: jsonb().$type<MessengerPersona[]>().default(sql`[]`).notNull(),
    personaId: text(),
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
    welcomeFlowId: bigintAsString().references(() => flowModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
  },
  (table) => [
    index("IntegrationMessenger_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    index("IntegrationMessenger_welcomeFlowId_idx").using(
      "btree",
      table.welcomeFlowId.asc().nullsLast(),
    ),
    uniqueIndex("IntegrationMessenger_inboxId_key").using(
      "btree",
      table.inboxId.asc().nullsLast(),
    ),
    uniqueIndex("IntegrationMessenger_pageId_key").using(
      "btree",
      table.pageId.asc().nullsLast(),
    ),
  ],
)
