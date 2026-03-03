import { sql } from "drizzle-orm"
import {
  boolean,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
  vector,
} from "drizzle-orm/pg-core"

export const logType = pgEnum("LogType", ["error", "audit"])
export const customFieldType = pgEnum("CustomFieldType", [
  "shortText",
  "number",
  "date",
  "datetime",
  "boolean",
  "longText",
])
export const fieldType = pgEnum("FieldType", ["accountField", "customField"])
export const folderType = pgEnum("FolderType", [
  "tag",
  "flow",
  "customField",
  "automatedResponse",
])
export const chatbotMemberRole = pgEnum("ChatbotMemberRole", ["owner", "agent"])
export const gender = pgEnum("Gender", ["male", "female", "unknown"])
export const senderType = pgEnum("SenderType", [
  "bot",
  "contact",
  "system",
  "user",
])
export const messageType = pgEnum("MessageType", [
  "incoming",
  "outgoing",
  "activity",
])
export const contentType = pgEnum("ContentType", ["text", "location"])
export const fileType = pgEnum("FileType", [
  "image",
  "video",
  "audio",
  "gif",
  "file",
])
export const broadcastStatus = pgEnum("BroadcastStatus", ["scheduled", "sent"])
export const broadcastSchedulesType = pgEnum("BroadcastSchedulesType", [
  "now",
  "future",
])
export const inboxType = pgEnum("InboxType", [
  "webchat",
  "messenger",
  "whatsapp",
  "zalo",
])
export const integrationType = pgEnum("IntegrationType", [
  "webchat",
  "googleSheets",
  "messenger",
  "openai",
  "gemini",
  "whatsapp",
  "zalo",
])
export const aiEmbeddingStatus = pgEnum("AIEmbeddingStatus", [
  "pending",
  "success",
  "error",
  "processing",
])

export const aiTriggerToIntegrationOpenAIModel = pgTable(
  "_AITriggerToIntegrationOpenAI",
  {
    a: text("A")
      .notNull()
      .references(() => aiTriggerModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "_AITriggerToIntegrationOpenAI_A_fkey",
      }),
    b: text("B")
      .notNull()
      .references(() => integrationOpenAIModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "_AITriggerToIntegrationOpenAI_B_fkey",
      }),
  },
  (table) => [
    primaryKey({
      columns: [table.a, table.b],
      name: "_AITriggerToIntegrationOpenAI_AB_pkey",
    }),
    index("_AITriggerToIntegrationOpenAI_B_index").using(
      "btree",
      table.b.asc().nullsLast().op("text_ops"),
    ),
  ],
)

export const contactsToTagsModel = pgTable(
  "_ContactToTag",
  {
    contactId: text("contactId")
      .notNull()
      .references(() => contactModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "_ContactToTag_A_fkey",
      }),
    tagId: text("tagId")
      .notNull()
      .references(() => tagModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "_ContactToTag_B_fkey",
      }),
  },
  (table) => [
    primaryKey({
      columns: [table.contactId, table.tagId],
      name: "_ContactToTag_contactId_tagId_pkey",
    }),
    uniqueIndex("_ContactToTag_contactId_tagId_key").using(
      "btree",
      table.contactId.asc().nullsLast().op("text_ops"),
      table.tagId.asc().nullsLast().op("text_ops"),
    ),
  ],
)

export const prismaMigrations = pgTable("_prisma_migrations", {
  id: varchar({ length: 36 }).primaryKey(),
  checksum: varchar({ length: 64 }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  migrationName: varchar("migration_name", { length: 255 }).notNull(),
  logs: text(),
  rolledBackAt: timestamp("rolled_back_at", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true })
    .default(sql`now()`)
    .notNull(),
  appliedStepsCount: integer("applied_steps_count").default(0).notNull(),
})

export const accountModel = pgTable("Account", {
  id: text().primaryKey(),
  accountId: text().notNull(),
  providerId: text().notNull(),
  accessToken: text(),
  accessTokenExpiresAt: timestamp({ precision: 3 }),
  refreshToken: text(),
  refreshTokenExpiresAt: timestamp({ precision: 3 }),
  scope: text(),
  idToken: text(),
  password: text(),
  createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
  updatedAt: timestamp({ precision: 3 })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
  userId: text()
    .notNull()
    .references(() => userModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "Account_userId_fkey",
    }),
})

export const activityLogModel = pgTable("ActivityLog", {
  id: text().primaryKey(),
  createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
  updatedAt: timestamp({ precision: 3 })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
  chatbotId: text()
    .notNull()
    .references(() => chatbotModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "ActivityLog_chatbotId_fkey",
    }),
  userId: text()
    .notNull()
    .references(() => userModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "ActivityLog_userId_fkey",
    }),
  data: text().notNull(),
  action: text().notNull(),
})

export const aiAgentModel = pgTable("AIAgent", {
  id: text().primaryKey(),
  chatbotId: text()
    .notNull()
    .references(() => chatbotModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "AIAgent_chatbotId_fkey",
    }),
  createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
  updatedAt: timestamp({ precision: 3 })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
  name: text().notNull(),
  prompt: text(),
  messages: jsonb().array().notNull().default(sql`[]`),
  isDefault: boolean().default(false).notNull(),
  tools: text().array().notNull().default(sql`[]`),
  models: jsonb().array().notNull().default(sql`[]`),
  temperature: doublePrecision().notNull(),
  maxOutputTokens: integer().notNull(),
})

export const aiAssistantModel = pgTable("AIAssistant", {
  id: text().primaryKey(),
  createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
  updatedAt: timestamp({ precision: 3 })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
  chatbotId: text()
    .notNull()
    .references(() => chatbotModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "AIAssistant_chatbotId_fkey",
    }),
  name: text().notNull(),
  prompt: text().notNull(),
  model: text().notNull(),
  aiTriggerIds: text().array().notNull().default(sql`[]`),
  attachmentIds: text().array().notNull().default(sql`[]`),
  temperature: doublePrecision().notNull(),
})

export const aiEmbeddingModel = pgTable(
  "AIEmbedding",
  {
    id: text().primaryKey(),
    createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
    content: text().notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    status: aiEmbeddingStatus().default("pending").notNull(),
    chatbotId: text()
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "AIEmbedding_chatbotId_fkey",
      }),
    aiFileId: text()
      .notNull()
      .references(() => aiFileModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "AIEmbedding_aiFileId_fkey",
      }),
  },
  (table) => [
    index("AIEmbedding_chatbotId_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast().op("text_ops"),
    ),
  ],
)

export const aiFileModel = pgTable("AIFile", {
  id: text().primaryKey(),
  createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
  updatedAt: timestamp({ precision: 3 })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
  name: text().notNull(),
  path: text().notNull(),
  size: integer().notNull(),
  mimeType: text().notNull(),
  chatbotId: text()
    .notNull()
    .references(() => chatbotModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "AIFile_chatbotId_fkey",
    }),
})

export const aiFunctionModel = pgTable("AIFunction", {
  id: text().primaryKey(),
  createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
  updatedAt: timestamp({ precision: 3 })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
  name: text().notNull(),
  purpose: text(),
  dataCollect: jsonb(),
  outputMessage: text(),
  triggerFlowId: text().references(() => flowModel.id, {
    onDelete: "set null",
    onUpdate: "cascade",
    name: "AIFunction_triggerFlowId_fkey",
  }),
  chatbotId: text()
    .notNull()
    .references(() => chatbotModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "AIFunction_chatbotId_fkey",
    }),
})

export const aiMCPServerModel = pgTable("AIMCPServer", {
  id: text().primaryKey(),
  createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
  updatedAt: timestamp({ precision: 3 })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
  name: text().notNull(),
  url: text().notNull(),
  auth: jsonb().notNull(),
  availableTools: jsonb().notNull(),
  selectedTools: text().array().notNull().default(sql`[]`),
  chatbotId: text()
    .notNull()
    .references(() => chatbotModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "AIMCPServer_chatbotId_fkey",
    }),
})

export const aiTriggerModel = pgTable("AITrigger", {
  id: text().primaryKey(),
  createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
  updatedAt: timestamp({ precision: 3 })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
  chatbotId: text()
    .notNull()
    .references(() => chatbotModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "AITrigger_chatbotId_fkey",
    }),
  name: text().notNull(),
  description: text(),
  flowId: text(),
  questions: jsonb().array().notNull().default(sql`[]`),
  finalMessage: text(),
})

export const attachmentModel = pgTable(
  "Attachment",
  {
    id: text().primaryKey(),
    createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
    chatbotId: text()
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "Attachment_chatbotId_fkey",
      }),
    conversationId: text()
      .notNull()
      .references(() => conversationModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "Attachment_conversationId_fkey",
      }),
    fileType: fileType().notNull(),
    messageId: text()
      .notNull()
      .references(() => messageModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "Attachment_messageId_fkey",
      }),
    sourceId: text(),
    mimeType: text().notNull(),
    width: integer(),
    height: integer(),
    size: integer().default(0).notNull(),
    thumbnailPath: text(),
    originPath: text().notNull(),
    name: text(),
  },
  (table) => [
    index("Attachment_chatbotId_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast().op("text_ops"),
    ),
    index("Attachment_messageId_idx").using(
      "btree",
      table.messageId.asc().nullsLast().op("text_ops"),
    ),
  ],
)

export const automatedResponseModel = pgTable(
  "AutomatedResponse",
  {
    id: text().primaryKey(),
    createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
    chatbotId: text()
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "AutomatedResponse_chatbotId_fkey",
      }),
    userMessages: text().array().notNull().default(sql`[]`),
    folderId: text(),
    replies: jsonb().array().notNull().default(sql`[]`),
    status: boolean().notNull(),
  },
  (table) => [
    index("AutomatedResponse_chatbotId_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast().op("text_ops"),
    ),
  ],
)

export const broadcastModel = pgTable(
  "Broadcast",
  {
    id: text().primaryKey(),
    createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
    name: text().notNull(),
    chatbotId: text()
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "Broadcast_chatbotId_fkey",
      }),
    flowId: text()
      .notNull()
      .references(() => flowModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "Broadcast_flowId_fkey",
      }),
    status: broadcastStatus().notNull(),
    schedulesType: broadcastSchedulesType().notNull(),
    schedulesAt: timestamp({ precision: 3 }).notNull(),
    contactFilter: jsonb(),
    subaction: text().default("BSOO").notNull(),
    inboxType: text().default("omnichannel").notNull(),
  },
  (table) => [
    index("Broadcast_chatbotId_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast().op("text_ops"),
    ),
    index("Broadcast_flowId_idx").using(
      "btree",
      table.flowId.asc().nullsLast().op("text_ops"),
    ),
    index("Broadcast_inboxType_idx").using(
      "btree",
      table.inboxType.asc().nullsLast().op("text_ops"),
    ),
    index("Broadcast_schedulesAt_idx").using(
      "btree",
      table.schedulesAt.asc().nullsLast().op("timestamp_ops"),
    ),
  ],
)

export const chatbotModel = pgTable("Chatbot", {
  id: text().primaryKey(),
  createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
  updatedAt: timestamp({ precision: 3 })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
  name: text().notNull(),
  defaultReply: text(),
  targetCountry: text(),
  defaultLanguage: text().default("en").notNull(),
  accountTimezone: text().notNull(),
  brandColor: text().default("#016DFF").notNull(),
  developmentMode: boolean().default(false).notNull(),
  logo: text(),
  organizationId: text()
    .notNull()
    .references(() => organizationModel.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
      name: "Chatbot_organizationId_fkey",
    }),
  plan: text().default("free").notNull(),
})

export const chatbotMemberModel = pgTable("ChatbotMember", {
  id: text().primaryKey(),
  createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
  updatedAt: timestamp({ precision: 3 })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
  chatbotId: text()
    .notNull()
    .references(() => chatbotModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "ChatbotMember_chatbotId_fkey",
    }),
  userId: text()
    .notNull()
    .references(() => userModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "ChatbotMember_userId_fkey",
    }),
  role: chatbotMemberRole().notNull(),
  notificationChannels: jsonb().default({}).notNull(),
  notificationTypes: jsonb().default({}).notNull(),
  permissions: jsonb().default({}).notNull(),
})

export const chatbotUsageModel = pgTable(
  "ChatbotUsage",
  {
    id: text().primaryKey(),
    createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
    contactsCount: integer().default(0).notNull(),
    maxContacts: integer().default(0).notNull(),
    chatbotId: text()
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "ChatbotUsage_chatbotId_fkey",
      }),
  },
  (table) => [
    uniqueIndex("ChatbotUsage_chatbotId_key").using(
      "btree",
      table.chatbotId.asc().nullsLast().op("text_ops"),
    ),
  ],
)

export const contactModel = pgTable(
  "Contact",
  {
    id: text().primaryKey(),
    createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
    avatar: text(),
    phoneNumber: text(),
    email: text(),
    emailVerified: boolean().default(false).notNull(),
    emailOptIn: boolean().default(false).notNull(),
    firstName: text(),
    lastName: text(),
    gender: gender().notNull(),
    source: text().notNull(),
    lastSeenAt: timestamp({ precision: 3 }),
    sourceId: text(),
    blockedAt: timestamp({ precision: 3 }),
    enableBroadcast: boolean().default(false).notNull(),
    chatbotId: text()
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "Contact_chatbotId_fkey",
      }),
  },
  (table) => [
    uniqueIndex("Contact_chatbotId_sourceId_key").using(
      "btree",
      table.chatbotId.asc().nullsLast().op("text_ops"),
      table.sourceId.asc().nullsLast().op("text_ops"),
    ),
  ],
)

export const contactCustomFieldModel = pgTable(
  "ContactCustomField",
  {
    id: text().primaryKey(),
    createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
    value: text().notNull(),
    contactId: text()
      .notNull()
      .references(() => contactModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "ContactCustomField_contactId_fkey",
      }),
    customFieldId: text()
      .notNull()
      .references(() => fieldModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "ContactCustomField_customFieldId_fkey",
      }),
  },
  (table) => [
    uniqueIndex("ContactCustomField_contactId_customFieldId_key").using(
      "btree",
      table.contactId.asc().nullsLast().op("text_ops"),
      table.customFieldId.asc().nullsLast().op("text_ops"),
    ),
  ],
)

export const contactInboxModel = pgTable(
  "ContactInbox",
  {
    contactId: text().notNull(),
    inboxId: text().notNull(),
    createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
    chatbotId: text().notNull(),
    sourceId: text().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.contactId, table.inboxId],
      name: "ContactInbox_pkey",
    }),
  ],
)

export const contactNoteModel = pgTable("ContactNote", {
  id: text().primaryKey(),
  createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
  updatedAt: timestamp({ precision: 3 })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
  content: text().notNull(),
  contactId: text()
    .notNull()
    .references(() => contactModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "ContactNote_contactId_fkey",
    }),
  createdById: text().references(() => userModel.id, {
    onDelete: "cascade",
    onUpdate: "cascade",
    name: "ContactNote_createdById_fkey",
  }),
})

export const contactsOnBroadcastsModel = pgTable(
  "ContactsOnBroadcasts",
  {
    broadcastId: text()
      .notNull()
      .references(() => broadcastModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "ContactsOnBroadcasts_broadcastId_fkey",
      }),
    contactId: text()
      .notNull()
      .references(() => contactModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "ContactsOnBroadcasts_contactId_fkey",
      }),
    sent: boolean().default(false).notNull(),
    delivered: boolean().default(false).notNull(),
    seen: boolean().default(false).notNull(),
    clicked: boolean().default(false).notNull(),
    failed: boolean().default(false).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.broadcastId, table.contactId],
      name: "ContactsOnBroadcasts_pkey",
    }),
  ],
)

export const conversationModel = pgTable(
  "Conversation",
  {
    id: text().primaryKey(),
    createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
    liveChatEnabled: boolean().default(false).notNull(),
    archivedAt: timestamp({ precision: 3 }),
    inboxType: inboxType().notNull().default("webchat"),
    sourceId: text(),
    conversationAttributes: jsonb(),
    contactLastSeenAt: timestamp({ precision: 3 }),
    agentLastSeenAt: timestamp({ precision: 3 }),
    lastActivityAt: timestamp({ precision: 3 }).defaultNow().notNull(),
    followed: boolean().default(false).notNull(),
    assignedUserId: text().references(() => userModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
      name: "Conversation_assignedUserId_fkey",
    }),
    assignedInboxTeamId: text().references(() => inboxTeamModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
      name: "Conversation_assignedInboxTeamId_fkey",
    }),
    chatbotId: text()
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "Conversation_chatbotId_fkey",
      }),
    contactId: text()
      .notNull()
      .references(() => contactModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "Conversation_contactId_fkey",
      }),
    inboxId: text()
      .notNull()
      .references(() => inboxModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "Conversation_inboxId_fkey",
      }),
    adminRepliedAt: timestamp({ precision: 3 }),
    contactRepliedAt: timestamp({ precision: 3 }),
  },
  (table) => [
    index("Conversation_chatbotId_sourceId_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast().op("text_ops"),
      table.sourceId.asc().nullsLast().op("text_ops"),
    ),
    uniqueIndex("Conversation_contactId_key").using(
      "btree",
      table.contactId.asc().nullsLast().op("text_ops"),
    ),
  ],
)

export const conversationParticipantModel = pgTable(
  "ConversationParticipant",
  {
    id: text().primaryKey(),
    createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
    chatbotId: text()
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "ConversationParticipant_chatbotId_fkey",
      }),
    conversationId: text()
      .notNull()
      .references(() => conversationModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "ConversationParticipant_conversationId_fkey",
      }),
    userId: text()
      .notNull()
      .references(() => userModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "ConversationParticipant_userId_fkey",
      }),
  },
  (table) => [
    index("ConversationParticipant_chatbotId_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast().op("text_ops"),
    ),
    index("ConversationParticipant_conversationId_idx").using(
      "btree",
      table.conversationId.asc().nullsLast().op("text_ops"),
    ),
    uniqueIndex("ConversationParticipant_conversationId_userId_key").using(
      "btree",
      table.conversationId.asc().nullsLast().op("text_ops"),
      table.userId.asc().nullsLast().op("text_ops"),
    ),
  ],
)

export const fieldModel = pgTable(
  "Field",
  {
    id: text().primaryKey(),
    createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
    name: text().notNull(),
    customFieldType: customFieldType().notNull(),
    description: text(),
    folderId: text().references(() => folderModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
      name: "Field_folderId_fkey",
    }),
    fieldType: fieldType().notNull(),
    value: text(),
    showInInbox: boolean().notNull(),
    chatbotId: text()
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "Field_chatbotId_fkey",
      }),
  },
  (table) => [
    uniqueIndex("Field_chatbotId_fieldType_name_key").using(
      "btree",
      table.chatbotId.asc().nullsLast().op("enum_ops"),
      table.fieldType.asc().nullsLast().op("text_ops"),
      table.name.asc().nullsLast().op("enum_ops"),
    ),
  ],
)

export const flowModel = pgTable("Flow", {
  id: text().primaryKey(),
  createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
  updatedAt: timestamp({ precision: 3 })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
  name: text().notNull(),
  active: boolean().default(true).notNull(),
  enableInInbox: boolean().default(true).notNull(),
  currentVersionId: text(),
  draftVersionId: text(),
  chatbotId: text()
    .notNull()
    .references(() => chatbotModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "Flow_chatbotId_fkey",
    }),
  folderId: text().references(() => folderModel.id, {
    onDelete: "set null",
    onUpdate: "cascade",
    name: "Flow_folderId_fkey",
  }),
})

export const flowRunModel = pgTable("FlowRun", {
  id: text().primaryKey(),
  createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
  updatedAt: timestamp({ precision: 3 })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
  chatbotId: text()
    .notNull()
    .references(() => chatbotModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "FlowRun_chatbotId_fkey",
    }),
  flowId: text()
    .notNull()
    .references(() => flowModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "FlowRun_flowId_fkey",
    }),
  flowVersionId: text()
    .notNull()
    .references(() => flowVersionModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "FlowRun_flowVersionId_fkey",
    }),
  conversationId: text().references(() => conversationModel.id, {
    onDelete: "cascade",
    onUpdate: "cascade",
    name: "FlowRun_conversationId_fkey",
  }),
})

export const flowVersionModel = pgTable("FlowVersion", {
  id: text().primaryKey(),
  createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
  updatedAt: timestamp({ precision: 3 })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
  chatbotId: text()
    .notNull()
    .references(() => chatbotModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "FlowVersion_chatbotId_fkey",
    }),
  flowId: text()
    .notNull()
    .references(() => flowModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "FlowVersion_flowId_fkey",
    }),
  nodes: jsonb().notNull(),
  edges: jsonb().notNull(),
  isDraft: boolean().notNull(),
  isLatest: boolean().default(false).notNull(),
  startNodeId: text().notNull(),
})

export const folderModel = pgTable(
  "Folder",
  {
    id: text().primaryKey(),
    createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
    name: text().notNull(),
    folderType: folderType().notNull(),
    parentId: text(),
    chatbotId: text()
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "Folder_chatbotId_fkey",
      }),
    isTrash: boolean().default(false).notNull(),
    paths: text().array().notNull().default(sql`[]`),
  },
  (table) => [
    foreignKey({
      columns: [table.parentId],
      foreignColumns: [table.id],
      name: "Folder_parentId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    index("Folder_chatbotId_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast().op("text_ops"),
    ),
    index("Folder_parentId_idx").using(
      "btree",
      table.parentId.asc().nullsLast().op("text_ops"),
    ),
  ],
)

export const inboxModel = pgTable(
  "Inbox",
  {
    id: text().primaryKey(),
    createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
    inboxType: inboxType().notNull(),
    sourceId: text().notNull(),
    chatbotId: text()
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "Inbox_chatbotId_fkey",
      }),
    status: text().default("connected").notNull(),
  },
  (table) => [
    index("Inbox_chatbotId_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast().op("text_ops"),
    ),
    uniqueIndex("Inbox_chatbotId_inboxType_sourceId_key").using(
      "btree",
      table.chatbotId.asc().nullsLast().op("text_ops"),
      table.inboxType.asc().nullsLast().op("enum_ops"),
      table.sourceId.asc().nullsLast().op("enum_ops"),
    ),
  ],
)

export const inboxTeamModel = pgTable("InboxTeam", {
  id: text().primaryKey(),
  createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
  updatedAt: timestamp({ precision: 3 })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
  chatbotId: text()
    .notNull()
    .references(() => chatbotModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "InboxTeam_chatbotId_fkey",
    }),
  name: text().notNull(),
})

export const inboxTeamMemberModel = pgTable("InboxTeamMember", {
  id: text().primaryKey(),
  chatbotId: text()
    .notNull()
    .references(() => chatbotModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "InboxTeamMember_chatbotId_fkey",
    }),
  inboxTeamId: text()
    .notNull()
    .references(() => inboxTeamModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "InboxTeamMember_inboxTeamId_fkey",
    }),
  userId: text()
    .notNull()
    .references(() => userModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "InboxTeamMember_userId_fkey",
    }),
  createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
  updatedAt: timestamp({ precision: 3 })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
})

export const integrationModel = pgTable(
  "Integration",
  {
    id: text().primaryKey(),
    createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
    chatbotId: text()
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "Integration_chatbotId_fkey",
      }),
    integrationType: integrationType().notNull(),
  },
  (table) => [
    index("Integration_chatbotId_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast().op("text_ops"),
    ),
  ],
)

export const integrationGeminiModel = pgTable(
  "IntegrationGemini",
  {
    id: text().primaryKey(),
    createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
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
    id: text().primaryKey(),
    createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
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
    id: text().primaryKey(),
    createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
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
    id: text().primaryKey(),
    createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
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
    id: text().primaryKey(),
    createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
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
    id: text().primaryKey(),
    createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
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
    id: text().primaryKey(),
    createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
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

export const invitationModel = pgTable(
  "Invitation",
  {
    id: text().primaryKey(),
    createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
    code: text().notNull(),
    permissions: jsonb().notNull(),
    expiresAt: timestamp({ precision: 3 }).notNull(),
    organizationId: text()
      .notNull()
      .references(() => organizationModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "Invitation_organizationId_fkey",
      }),
    chatbotId: text().references(() => chatbotModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "Invitation_chatbotId_fkey",
    }),
    invitedBy: text()
      .notNull()
      .references(() => userModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "Invitation_invitedBy_fkey",
      }),
  },
  (table) => [
    uniqueIndex("Invitation_code_key").using(
      "btree",
      table.code.asc().nullsLast().op("text_ops"),
    ),
  ],
)

export const errorLogModel = pgTable("ErrorLog", {
  id: text().primaryKey(),
  createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
  updatedAt: timestamp({ precision: 3 })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
  action: text().notNull(),
  detail: text().notNull(),
  httpCode: text(),
  chatbotId: text()
    .notNull()
    .references(() => chatbotModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "ErrorLog_chatbotId_fkey",
    }),
  contactId: text().references(() => contactModel.id, {
    onDelete: "set null",
    onUpdate: "cascade",
    name: "ErrorLog_contactId_fkey",
  }),
})

export const auditLogModel = pgTable("AuditLog", {
  id: text().primaryKey(),
  createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
  updatedAt: timestamp({ precision: 3 })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
  action: text().notNull(),
  detail: text().notNull(),
  chatbotId: text()
    .notNull()
    .references(() => chatbotModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "AuditLog_chatbotId_fkey",
    }),
  userId: text()
    .notNull()
    .references(() => userModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
      name: "AuditLog_userId_fkey",
    }),
})

export const messageModel = pgTable(
  "Message",
  {
    id: text().primaryKey(),
    createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
    conversationId: text()
      .notNull()
      .references(() => conversationModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "Message_conversationId_fkey",
      }),
    inboxId: text()
      .notNull()
      .references(() => inboxModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "Message_inboxId_fkey",
      }),
    chatbotId: text()
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "Message_chatbotId_fkey",
      }),
    content: text(),
    contentAttributes: jsonb(),
    messageType: messageType().notNull(),
    contentType: contentType().notNull(),
    senderType: senderType().notNull(),
    senderId: text(),
    sourceId: text(),
  },
  (table) => [
    index("Message_chatbotId_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast().op("text_ops"),
    ),
    uniqueIndex("Message_chatbotId_sourceId_key").using(
      "btree",
      table.chatbotId.asc().nullsLast().op("text_ops"),
      table.sourceId.asc().nullsLast().op("text_ops"),
    ),
    index("Message_conversationId_idx").using(
      "btree",
      table.conversationId.asc().nullsLast().op("text_ops"),
    ),
    index("Message_inboxId_idx").using(
      "btree",
      table.inboxId.asc().nullsLast().op("text_ops"),
    ),
    index("Message_senderType_senderId_idx").using(
      "btree",
      table.senderType.asc().nullsLast().op("enum_ops"),
      table.senderId.asc().nullsLast().op("text_ops"),
    ),
  ],
)

export const organizationModel = pgTable(
  "Organization",
  {
    id: text().primaryKey(),
    createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
    name: text().notNull(),
    slug: text(),
    logo: text(),
    metadata: text(),
    domain: text(),
    supportEmail: text(),
    settings: jsonb().default({}).notNull(),
    defaultMaxContacts: integer().default(999_999_999).notNull(),
  },
  (table) => [
    index("Organization_domain_idx").using(
      "btree",
      table.domain.asc().nullsLast().op("text_ops"),
    ),
    uniqueIndex("Organization_slug_key").using(
      "btree",
      table.slug.asc().nullsLast().op("text_ops"),
    ),
  ],
)

export const organizationMemberModel = pgTable("OrganizationMember", {
  id: text().primaryKey(),
  createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
  updatedAt: timestamp({ precision: 3 })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
  role: text().notNull(),
  organizationId: text()
    .notNull()
    .references(() => organizationModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "OrganizationMember_organizationId_fkey",
    }),
  userId: text()
    .notNull()
    .references(() => userModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "OrganizationMember_userId_fkey",
    }),
})

export const sessionModel = pgTable(
  "Session",
  {
    id: text().primaryKey(),
    createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
    expiresAt: timestamp({ precision: 3 }).notNull(),
    token: text().notNull(),
    ipAddress: text(),
    userAgent: text(),
    userId: text()
      .notNull()
      .references(() => userModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "Session_userId_fkey",
      }),
  },
  (table) => [
    uniqueIndex("Session_token_key").using(
      "btree",
      table.token.asc().nullsLast().op("text_ops"),
    ),
  ],
)

export const spreadsheetModel = pgTable(
  "Spreadsheet",
  {
    id: text().primaryKey(),
    createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
    chatbotId: text()
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "Spreadsheet_chatbotId_fkey",
      }),
    name: text().notNull(),
    url: text().notNull(),
    spreadsheetId: text().notNull(),
  },
  (table) => [
    index("Spreadsheet_chatbotId_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast().op("text_ops"),
    ),
    index("Spreadsheet_chatbotId_spreadsheetId_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast().op("text_ops"),
      table.spreadsheetId.asc().nullsLast().op("text_ops"),
    ),
    index("Spreadsheet_spreadsheetId_idx").using(
      "btree",
      table.spreadsheetId.asc().nullsLast().op("text_ops"),
    ),
  ],
)

export const tagModel = pgTable(
  "Tag",
  {
    id: text().primaryKey(),
    createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
    name: text().notNull(),
    folderId: text().references(() => folderModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
      name: "Tag_folderId_fkey",
    }),
    syncToMessenger: boolean().default(false).notNull(),
    chatbotId: text()
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "Tag_chatbotId_fkey",
      }),
  },
  (table) => [
    uniqueIndex("Tag_chatbotId_name_key").using(
      "btree",
      table.chatbotId.asc().nullsLast().op("text_ops"),
      table.name.asc().nullsLast().op("text_ops"),
    ),
    index("Tag_folderId_idx").using(
      "btree",
      table.folderId.asc().nullsLast().op("text_ops"),
    ),
  ],
)

export const userModel = pgTable(
  "User",
  {
    id: text().primaryKey(),
    createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp({ precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
    name: text(),
    email: text().notNull(),
    emailVerified: boolean().default(false).notNull(),
    image: text(),
    isAnonymous: boolean().default(false).notNull(),
  },
  (table) => [
    uniqueIndex("User_email_key").using(
      "btree",
      table.email.asc().nullsLast().op("text_ops"),
    ),
  ],
)

export const verificationModel = pgTable("Verification", {
  id: text().primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: timestamp({ precision: 3 }).notNull(),
  createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
  updatedAt: timestamp({ precision: 3 })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
})

export const whatsappFlowModel = pgTable("WhatsappFlow", {
  id: text().primaryKey(),
  createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
  updatedAt: timestamp({ precision: 3 })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
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
  id: text().primaryKey(),
  createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
  updatedAt: timestamp({ precision: 3 })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
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
