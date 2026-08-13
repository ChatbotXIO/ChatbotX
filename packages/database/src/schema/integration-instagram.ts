import type { EncryptedData } from "@chatbotx.io/encryption"
import { sql } from "drizzle-orm"
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import type {
  InstagramConversationStarter,
  InstagramPersistentMenu,
  IntegrationUserInfo,
} from "../partials"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { flowModel } from "./flow"
import { inboxModel } from "./inbox"
import { workspaceModel } from "./workspace"

export const integrationInstagramModel = pgTable(
  "IntegrationInstagram",
  {
    ...sharedColumns,
    auth: jsonb().notNull(),
    userInfo: jsonb().$type<IntegrationUserInfo>(),
    igId: text().notNull(),
    pageId: text().notNull(),
    name: text().notNull(),
    username: text().notNull(),
    coexistEnabled: boolean().notNull().default(false),
    hasCapiScope: boolean().notNull().default(false),
    capiScopeCheckedAt: timestamp(timestampConfig),
    datasetId: text(),
    capiAccessToken: jsonb().$type<EncryptedData>(),
    capiDisconnectedAt: timestamp(timestampConfig),
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
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "IntegrationInstagram_workspaceId_fkey",
      }),
    inboxId: bigintAsString()
      .notNull()
      .references(() => inboxModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "IntegrationInstagram_inboxId_fkey",
      }),
    welcomeFlowId: bigintAsString().references(() => flowModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
      name: "IntegrationInstagram_welcomeFlowId_fkey",
    }),
    type: text()
      .$type<"instagram" | "facebook">()
      .default("instagram")
      .notNull(),
    tokenRefreshError: text(),
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
