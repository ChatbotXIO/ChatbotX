import { sql } from "drizzle-orm"
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { aiAgentModel, aiAssistantModel } from "./ai"
import { chatbotModel } from "./chatbot"
import { inboxModel } from "./conversation"
import { flowModel } from "./flow"
import { sharedColumns } from "./shared"

export const integrationModel = pgTable(
  "Integration",
  {
    ...sharedColumns,
    chatbotId: text()
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "Integration_chatbotId_fkey",
      }),
    integrationType: text().notNull(),
  },
  (table) => [
    index("Integration_chatbotId_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast().op("text_ops"),
    ),
    index("Integration_chatbotId_integrationType_key").using(
      "btree",
      table.chatbotId.asc().nullsLast().op("text_ops"),
      table.integrationType.asc().nullsLast().op("text_ops"),
    ),
  ],
)

export const integrationGeminiModel = pgTable(
  "IntegrationGemini",
  {
    ...sharedColumns,
    auth: jsonb().notNull(),
    autoReply: boolean().default(false).notNull(),
    chatbotId: text()
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "IntegrationGemini_chatbotId_fkey",
      }),
    integrationId: text()
      .notNull()
      .references(() => integrationModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "IntegrationGemini_integrationId_fkey",
      }),
    maxOutputTokens: integer().notNull(),
    model: text().notNull(),
    prompt: text(),
    temperature: doublePrecision().notNull(),
  },
  (table) => [
    uniqueIndex("IntegrationGemini_chatbotId_key").using(
      "btree",
      table.chatbotId.asc().nullsLast().op("text_ops"),
    ),
    uniqueIndex("IntegrationGemini_integrationId_key").using(
      "btree",
      table.integrationId.asc().nullsLast().op("text_ops"),
    ),
  ],
)

export const integrationGoogleSheetsModel = pgTable(
  "IntegrationGoogleSheets",
  {
    ...sharedColumns,
    chatbotId: text()
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "IntegrationGoogleSheets_chatbotId_fkey",
      }),
    integrationId: text()
      .notNull()
      .references(() => integrationModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "IntegrationGoogleSheets_integrationId_fkey",
      }),
    auth: jsonb().notNull(),
  },
  (table) => [
    uniqueIndex("IntegrationGoogleSheets_integrationId_key").using(
      "btree",
      table.integrationId.asc().nullsLast().op("text_ops"),
    ),
  ],
)

export const integrationMessengerModel = pgTable(
  "IntegrationMessenger",
  {
    ...sharedColumns,
    auth: jsonb().notNull(),
    pageId: text().notNull(),
    name: text().notNull(),
    chatbotId: text()
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "IntegrationMessenger_chatbotId_fkey",
      }),
    inboxId: text()
      .notNull()
      .references(() => inboxModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "IntegrationMessenger_inboxId_fkey",
      }),
    fallbackFlowId: text().references(() => flowModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
      name: "IntegrationMessenger_fallbackFlowId_fkey",
    }),
  },
  (table) => [
    index("IntegrationMessenger_chatbotId_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast().op("text_ops"),
    ),
    index("IntegrationMessenger_fallbackFlowId_idx").using(
      "btree",
      table.fallbackFlowId.asc().nullsLast().op("text_ops"),
    ),
    uniqueIndex("IntegrationMessenger_inboxId_key").using(
      "btree",
      table.inboxId.asc().nullsLast().op("text_ops"),
    ),
    uniqueIndex("IntegrationMessenger_pageId_key").using(
      "btree",
      table.pageId.asc().nullsLast().op("text_ops"),
    ),
  ],
)

export const integrationOpenAIModel = pgTable(
  "IntegrationOpenAI",
  {
    ...sharedColumns,
    auth: jsonb().notNull(),
    autoReply: boolean().default(true).notNull(),
    autoReplyVoice: boolean().default(false).notNull(),
    voice: text(),
    prompt: text(),
    model: text().notNull(),
    temperature: doublePrecision().notNull(),
    maxOutputTokens: integer().notNull(),
    chatbotId: text()
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "IntegrationOpenAI_chatbotId_fkey",
      }),
    integrationId: text()
      .notNull()
      .references(() => integrationModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "IntegrationOpenAI_integrationId_fkey",
      }),
    aiAssistantId: text().references(() => aiAssistantModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
      name: "IntegrationOpenAI_aiAssistantId_fkey",
    }),
    aiAgentId: text().references(() => aiAgentModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
      name: "IntegrationOpenAI_aiAgentId_fkey",
    }),
  },
  (table) => [
    uniqueIndex("IntegrationOpenAI_integrationId_key").using(
      "btree",
      table.integrationId.asc().nullsLast().op("text_ops"),
    ),
  ],
)

export const integrationWebchatModel = pgTable(
  "IntegrationWebchat",
  {
    ...sharedColumns,
    auth: jsonb().notNull(),
    name: text().notNull(),
    enable: boolean().default(true).notNull(),
    authorizedDomains: text().array().notNull().default(sql`[]`),
    conversationStarters: jsonb().array().notNull().default(sql`[]`),
    persistentMenus: jsonb().array().notNull().default(sql`[]`),
    brandColor: text().default("#007bff").notNull(),
    hideHeader: boolean().default(false).notNull(),
    showLogo: boolean().default(false).notNull(),
    hideMessageInput: boolean().default(false).notNull(),
    customCss: text(),
    chatbotId: text()
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "IntegrationWebchat_chatbotId_fkey",
      }),
    inboxId: text()
      .notNull()
      .references(() => inboxModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "IntegrationWebchat_inboxId_fkey",
      }),
    welcomeFlowId: text().references(() => flowModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
      name: "IntegrationWebchat_welcomeFlowId_fkey",
    }),
  },
  (table) => [
    index("IntegrationWebchat_chatbotId_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast().op("text_ops"),
    ),
    index("IntegrationWebchat_inboxId_idx").using(
      "btree",
      table.inboxId.asc().nullsLast().op("text_ops"),
    ),
    uniqueIndex("IntegrationWebchat_inboxId_key").using(
      "btree",
      table.inboxId.asc().nullsLast().op("text_ops"),
    ),
    index("IntegrationWebchat_welcomeFlowId_idx").using(
      "btree",
      table.welcomeFlowId.asc().nullsLast().op("text_ops"),
    ),
  ],
)

export const integrationWhatsappModel = pgTable(
  "IntegrationWhatsapp",
  {
    ...sharedColumns,
    auth: jsonb().notNull(),
    phoneNumberId: text().notNull(),
    wabaId: text().notNull(),
    businessId: text().notNull(),
    name: text().notNull(),
    chatbotId: text()
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "IntegrationWhatsapp_chatbotId_fkey",
      }),
    inboxId: text()
      .notNull()
      .references(() => inboxModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "IntegrationWhatsapp_inboxId_fkey",
      }),
  },
  (table) => [
    uniqueIndex("IntegrationWhatsapp_inboxId_key").using(
      "btree",
      table.inboxId.asc().nullsLast().op("text_ops"),
    ),
  ],
)

export const integrationZaloModel = pgTable(
  "IntegrationZalo",
  {
    ...sharedColumns,
    auth: jsonb().notNull(),
    oaId: text().notNull(),
    name: text().notNull(),
    chatbotId: text()
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "IntegrationZalo_chatbotId_fkey",
      }),
    inboxId: text()
      .notNull()
      .references(() => inboxModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "IntegrationZalo_inboxId_fkey",
      }),
    fallbackFlowId: text().references(() => flowModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
      name: "IntegrationZalo_fallbackFlowId_fkey",
    }),
  },
  (table) => [
    index("IntegrationZalo_chatbotId_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast().op("text_ops"),
    ),
    index("IntegrationZalo_fallbackFlowId_idx").using(
      "btree",
      table.fallbackFlowId.asc().nullsLast().op("text_ops"),
    ),
    uniqueIndex("IntegrationZalo_inboxId_key").using(
      "btree",
      table.inboxId.asc().nullsLast().op("text_ops"),
    ),
  ],
)

export const whatsappFlowModel = pgTable("WhatsappFlow", {
  ...sharedColumns,
  name: text().notNull(),
  integrationWhatsappId: text()
    .notNull()
    .references(() => integrationWhatsappModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "WhatsappFlow_integrationWhatsappId_fkey",
    }),
  sourceId: text().notNull(),
  status: text().notNull(),
  isCompleted: boolean().notNull(),
})

export const whatsappMessageTemplateModel = pgTable("WhatsappMessageTemplate", {
  ...sharedColumns,
  name: text().notNull(),
  integrationWhatsappId: text()
    .notNull()
    .references(() => integrationWhatsappModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "WhatsappMessageTemplate_integrationWhatsappId_fkey",
    }),
  sourceId: text().notNull(),
  language: text().notNull(),
  category: text().notNull(),
  status: text().notNull(),
})
