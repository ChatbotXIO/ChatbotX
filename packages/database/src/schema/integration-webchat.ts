import { sql } from "drizzle-orm"
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import type {
  WebchatConversationStarter,
  WebchatPersistentMenu,
} from "../partials/integration-webchat"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { flowModel } from "./flow"
import { inboxModel } from "./inbox"
import { workspaceModel } from "./workspace"

export const integrationWebchatModel = pgTable(
  "IntegrationWebchat",
  {
    ...sharedColumns,
    auth: jsonb().notNull(),
    name: text().notNull(),
    enable: boolean().default(true).notNull(),
    authorizedDomains: text().array().notNull().default(sql`[]`),
    conversationStarters: jsonb()
      .$type<WebchatConversationStarter>()
      .array()
      .notNull()
      .default(sql`[]`),
    persistentMenus: jsonb()
      .$type<WebchatPersistentMenu>()
      .array()
      .notNull()
      .default(sql`[]`),
    brandColor: text().notNull(),
    hideHeader: boolean().default(false).notNull(),
    showLogo: boolean().default(false).notNull(),
    hideMessageInput: boolean().default(false).notNull(),
    customCss: text(),
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
    index("IntegrationWebchat_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    index("IntegrationWebchat_inboxId_idx").using(
      "btree",
      table.inboxId.asc().nullsLast(),
    ),
    uniqueIndex("IntegrationWebchat_inboxId_key").using(
      "btree",
      table.inboxId.asc().nullsLast(),
    ),
    index("IntegrationWebchat_welcomeFlowId_idx").using(
      "btree",
      table.welcomeFlowId.asc().nullsLast(),
    ),
  ],
)
