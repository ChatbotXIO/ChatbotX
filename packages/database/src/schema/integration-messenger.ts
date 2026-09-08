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
import type { IntegrationUserInfo } from "../partials/integration"
import type {
  MessengerConversationStarter,
  MessengerPersistentMenu,
  MessengerPersona,
} from "../partials/integration-messenger"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { flowModel } from "./flow"
import { inboxModel } from "./inbox"
import { workspaceModel } from "./workspace"

/**
 * Enforces that a Meta page backs exactly one integration.
 *
 * Exported so callers can recognise this specific collision: the table has
 * more than one unique index, and this one means "already connected" rather
 * than a bug (mirrors `WHATSAPP_PHONE_NUMBER_UNIQUE_CONSTRAINT`).
 */
export const MESSENGER_PAGE_ID_UNIQUE_CONSTRAINT =
  "IntegrationMessenger_pageId_key"

export const integrationMessengerModel = pgTable(
  "IntegrationMessenger",
  {
    ...sharedColumns,
    auth: jsonb().notNull(),
    userInfo: jsonb().$type<IntegrationUserInfo>(),
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
    coexistEnabled: boolean().notNull().default(false),
    coexistAiReadsSyncedHistory: boolean().notNull().default(false),
    hasCapiScope: boolean().notNull().default(false),
    capiScopeCheckedAt: timestamp(timestampConfig),
    datasetId: text(),
    capiAccessToken: jsonb().$type<EncryptedData>(),
    capiDisconnectedAt: timestamp(timestampConfig),
    // Meta Events Manager "test_event_code": while set, every CAPI event for
    // this integration is routed to the dataset's Test Events view.
    capiTestEventCode: text(),
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
    syncTagEnabledAt: timestamp(timestampConfig),
    tokenRefreshError: text(),
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
    uniqueIndex(MESSENGER_PAGE_ID_UNIQUE_CONSTRAINT).using(
      "btree",
      table.pageId.asc().nullsLast(),
    ),
  ],
)
