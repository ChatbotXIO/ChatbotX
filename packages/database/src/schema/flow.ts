import { bigint, boolean, jsonb, pgTable, text } from "drizzle-orm/pg-core"
import { sharedColumns } from "../partials/shared"
import { chatbotModel } from "./chatbot"
import { conversationModel } from "./conversation"
import { folderModel } from "./folder"

export const flowModel = pgTable("flows", {
  ...sharedColumns,
  name: text("name").notNull(),
  active: boolean("active").default(true).notNull(),
  enableInInbox: boolean("enable_in_inbox").default(true).notNull(),
  currentVersionId: bigint("current_version_id", { mode: "bigint" }),
  draftVersionId: text("draft_version_id"),
  chatbotId: bigint("chatbot_id", { mode: "bigint" })
    .notNull()
    .references(() => chatbotModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  folderId: bigint("folder_id", { mode: "bigint" }).references(
    () => folderModel.id,
    {
      onDelete: "set null",
      onUpdate: "cascade",
    },
  ),
})

export const flowRunModel = pgTable("flow_runs", {
  ...sharedColumns,
  chatbotId: bigint("chatbot_id", { mode: "bigint" })
    .notNull()
    .references(() => chatbotModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  flowId: bigint("flow_id", { mode: "bigint" })
    .notNull()
    .references(() => flowModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  flowVersionId: bigint("flow_version_id", { mode: "bigint" })
    .notNull()
    .references(() => flowVersionModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  conversationId: bigint("conversation_id", { mode: "bigint" }).references(
    () => conversationModel.id,
    {
      onDelete: "cascade",
      onUpdate: "cascade",
    },
  ),
})

export const flowVersionModel = pgTable("flow_versions", {
  ...sharedColumns,
  chatbotId: bigint("chatbot_id", { mode: "bigint" })
    .notNull()
    .references(() => chatbotModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  flowId: bigint("flow_id", { mode: "bigint" })
    .notNull()
    .references(() => flowModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  nodes: jsonb("nodes").$type<unknown[]>().notNull(),
  edges: jsonb("edges").$type<unknown[]>().notNull(),
  isDraft: boolean("is_draft").notNull(),
  isLatest: boolean("is_latest").default(false).notNull(),
  startNodeId: bigint("start_node_id", { mode: "bigint" }).notNull(),
})
