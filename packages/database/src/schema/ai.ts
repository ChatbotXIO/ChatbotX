import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  vector,
} from "drizzle-orm/pg-core"
import type { AIMcpServerAuth } from "../partials/ai"
import { sharedColumns } from "../partials/shared"
import { chatbotModel } from "./chatbot"
import { flowModel } from "./flow"
import { integrationOpenAIModel } from "./integrations/open-ai"

export const aiEmbeddingStatus = pgEnum("ai_embedding_status", [
  "pending",
  "success",
  "error",
  "processing",
])

export const aiTriggerToIntegrationOpenAIModel = pgTable(
  "ai_triggers_to_integration_open_ais",
  {
    aiTriggerId: bigint("ai_trigger_id", { mode: "bigint" })
      .notNull()
      .references(() => aiTriggerModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    integrationOpenAIId: bigint("integration_open_ai_id", { mode: "bigint" })
      .notNull()
      .references(() => integrationOpenAIModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    primaryKey({
      columns: [table.aiTriggerId, table.integrationOpenAIId],
    }),
  ],
)

export const aiAgentModel = pgTable("ai_agents", {
  ...sharedColumns,
  chatbotId: bigint("chatbot_id", { mode: "bigint" })
    .notNull()
    .references(() => chatbotModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  name: text("name").notNull(),
  prompt: text("prompt"),
  messages: jsonb("messages").array().notNull().default(sql`[]`),
  isDefault: boolean("is_default").default(false).notNull(),
  tools: text("tools").array().notNull().default(sql`[]`),
  models: jsonb("models").array().notNull().default(sql`[]`),
  temperature: doublePrecision("temperature").notNull(),
  maxOutputTokens: integer("max_output_tokens").notNull(),
})

export const aiAssistantModel = pgTable("ai_assistants", {
  ...sharedColumns,
  chatbotId: bigint("chatbot_id", { mode: "bigint" })
    .notNull()
    .references(() => chatbotModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  name: text("name").notNull(),
  prompt: text("prompt").notNull(),
  model: text("model").notNull(),
  aiTriggerIds: text("ai_trigger_ids").array().notNull().default(sql`[]`),
  attachmentIds: text("attachment_ids").array().notNull().default(sql`[]`),
  temperature: doublePrecision("temperature").notNull(),
})

export const aiEmbeddingModel = pgTable(
  "ai_embeddings",
  {
    ...sharedColumns,
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    status: aiEmbeddingStatus("status").default("pending").notNull(),
    chatbotId: bigint("chatbot_id", { mode: "bigint" })
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    aiFileId: bigint("ai_file_id", { mode: "bigint" })
      .notNull()
      .references(() => aiFileModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    index("AIEmbedding_chatbotId_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast(),
    ),
  ],
)

export const aiFileModel = pgTable("ai_files", {
  ...sharedColumns,
  name: text("name").notNull(),
  path: text("path").notNull(),
  size: integer("size").notNull(),
  mimeType: text("mime_type").notNull(),
  chatbotId: bigint("chatbot_id", { mode: "bigint" })
    .notNull()
    .references(() => chatbotModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
})

export const aiFunctionModel = pgTable("ai_functions", {
  ...sharedColumns,
  name: text("name").notNull(),
  purpose: text("purpose"),
  dataCollect: jsonb("data_collect"),
  outputMessage: text("output_message"),
  triggerFlowId: bigint("trigger_flow_id", { mode: "bigint" }).references(
    () => flowModel.id,
    {
      onDelete: "set null",
      onUpdate: "cascade",
    },
  ),
  chatbotId: bigint("chatbot_id", { mode: "bigint" })
    .notNull()
    .references(() => chatbotModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
})

export const aiMCPServerModel = pgTable("ai_mcp_servers", {
  ...sharedColumns,
  name: text("name").notNull(),
  url: text("url").notNull(),
  auth: jsonb("auth").$type<AIMcpServerAuth>().notNull(),
  availableTools: jsonb("available_tools")
    .$type<{ [x: string]: unknown }>()
    .notNull(),
  selectedTools: text("selected_tools").array().notNull().default(sql`[]`),
  chatbotId: bigint("chatbot_id", { mode: "bigint" })
    .notNull()
    .references(() => chatbotModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
})

export const aiTriggerModel = pgTable("ai_triggers", {
  ...sharedColumns,
  chatbotId: bigint("chatbot_id", { mode: "bigint" })
    .notNull()
    .references(() => chatbotModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  name: text("name").notNull(),
  description: text("description"),
  flowId: bigint("flow_id", { mode: "bigint" }),
  questions: jsonb("questions").array().notNull().default(sql`[]`),
  finalMessage: text("final_message"),
})
