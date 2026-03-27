import { sql } from "drizzle-orm"
import {
  bigint,
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
import type {
  ChatbotMemberNotificationChannels,
  ChatbotMemberNotificationTypes,
  ChatbotMemberPermissions,
} from "./chatbot"
import type {
  MessengerConversationStarter,
  MessengerGreetingMessage,
  MessengerPersistentMenu,
  MessengerPersona,
} from "./integrations/messenger"
import type {
  WebchatConversationStarter,
  WebchatPersistentMenu,
} from "./integrations/webchat"
import type { OrganizationSettings } from "./organization-settings"
import { sharedColumns, timestampConfig } from "./shared"

export * from "drizzle-orm/zod"
export * from "./enterprise"
export * from "./integrations"

export const logType = pgEnum("LogType", ["error", "audit"])
export const customFieldType = pgEnum("CustomFieldType", [
  "shortText",
  "number",
  "date",
  "datetime",
  "boolean",
  "longText",
])
export const folderType = pgEnum("FolderType", [
  "tag",
  "flow",
  "customField",
  "automatedResponse",
  "trigger",
  "webhook",
  "sequence",
])
export const chatbotMemberRole = pgEnum("ChatbotMemberRole", ["owner", "agent"])
export const gender = pgEnum("Gender", ["male", "female", "unknown"])
export const senderType = pgEnum("SenderType", [
  "bot",
  "contact",
  "system",
  "user",
  "api",
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
export const aiEmbeddingStatus = pgEnum("AIEmbeddingStatus", [
  "pending",
  "success",
  "error",
  "processing",
])

export const analyticsStatusEnum = pgEnum("AnalyticsStatus", [
  "processing",
  "ingested",
  "failed",
])
export const conditionOwnerType = pgEnum("ConditionOwnerType", [
  "trigger",
  "webhook",
  "broadcast",
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
  ...sharedColumns,
  accountId: text().notNull(),
  providerId: text().notNull(),
  accessToken: text(),
  accessTokenExpiresAt: timestamp(timestampConfig),
  refreshToken: text(),
  refreshTokenExpiresAt: timestamp(timestampConfig),
  scope: text(),
  idToken: text(),
  password: text(),
  userId: text()
    .notNull()
    .references(() => userModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "Account_userId_fkey",
    }),
})

export const aiAgentModel = pgTable("AIAgent", {
  ...sharedColumns,
  chatbotId: text()
    .notNull()
    .references(() => chatbotModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "AIAgent_chatbotId_fkey",
    }),
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
  ...sharedColumns,
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
    ...sharedColumns,
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
  ...sharedColumns,
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
  ...sharedColumns,
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
  ...sharedColumns,
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
  ...sharedColumns,
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
    ...sharedColumns,
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
    ...sharedColumns,
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
    ...sharedColumns,
    name: text().notNull(),
    chatbotId: text()
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "Broadcast_chatbotId_fkey",
      }),
    flowId: text().references(() => flowModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "Broadcast_flowId_fkey",
    }),
    integrationWhatsappId: text().references(
      () => integrationWhatsappModel.id,
      {
        onDelete: "set null",
        onUpdate: "cascade",
        name: "Broadcast_integrationWhatsappId_fkey",
      },
    ),
    templateId: text(),
    templateData: jsonb().notNull().default("{}"),
    status: broadcastStatus().notNull(),
    schedulesType: broadcastSchedulesType().notNull(),
    schedulesAt: timestamp(timestampConfig).notNull(),
    contactFilter: jsonb(),
    subaction: text().default("BSOO").notNull(),
    channel: text().default("omnichannel").notNull(),
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
    index("Broadcast_channel_idx").using(
      "btree",
      table.channel.asc().nullsLast().op("text_ops"),
    ),
    index("Broadcast_schedulesAt_idx").using(
      "btree",
      table.schedulesAt.asc().nullsLast().op("timestamp_ops"),
    ),
  ],
)

export const chatbotModel = pgTable("Chatbot", {
  ...sharedColumns,
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
  token: text(),
})

export const chatbotMemberModel = pgTable("ChatbotMember", {
  ...sharedColumns,
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
  notificationChannels: jsonb()
    .$type<ChatbotMemberNotificationChannels>()
    .default(sql`'{}'`)
    .notNull(),
  notificationTypes: jsonb()
    .$type<ChatbotMemberNotificationTypes>()
    .default(sql`'{}'`)
    .notNull(),
  permissions: jsonb()
    .$type<ChatbotMemberPermissions>()
    .default(sql`'{}'`)
    .notNull(),
})

export const chatbotUsageModel = pgTable(
  "ChatbotUsage",
  {
    ...sharedColumns,
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
    ...sharedColumns,
    avatar: text(),
    phoneNumber: text(),
    email: text(),
    emailVerified: boolean().default(false).notNull(),
    emailOptIn: boolean().default(false).notNull(),
    firstName: text(),
    lastName: text(),
    gender: gender().notNull(),
    channel: text().notNull(),
    lastReadAt: timestamp(timestampConfig),
    source: text(),
    ref: text(),
    country: text(),
    state: text(),
    city: text(),
    location: jsonb().$type<{
      latitude: number
      longitude: number
    }>(),
    locale: text(),
    timezone: text(),
    subscribedAt: timestamp(timestampConfig),
    sourceId: text(),
    blockedAt: timestamp(timestampConfig),
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
    ...sharedColumns,
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
      .references(() => customFieldModel.id, {
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
    createdAt: sharedColumns.createdAt,
    updatedAt: sharedColumns.updatedAt,
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
  ...sharedColumns,
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
    ...sharedColumns,
    liveChatEnabled: boolean().default(false).notNull(),
    archivedAt: timestamp(timestampConfig),
    channel: text().notNull().default("webchat"),
    sourceId: text(),
    conversationAttributes: jsonb().$type<{ [x: string]: unknown }>(),
    contactLastReadAt: timestamp(timestampConfig),
    agentLastReadAt: timestamp(timestampConfig),
    lastActivityAt: timestamp(timestampConfig).defaultNow().notNull(),
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
    adminRepliedAt: timestamp(timestampConfig),
    contactRepliedAt: timestamp(timestampConfig),
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
    ...sharedColumns,
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

export const customFieldModel = pgTable(
  "CustomField",
  {
    ...sharedColumns,
    name: text().notNull(),
    type: customFieldType().notNull(),
    description: text(),
    folderId: text().references(() => folderModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
      name: "Field_folderId_fkey",
    }),
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
    uniqueIndex("CustomField_chatbotId_fieldType_name_key").using(
      "btree",
      table.chatbotId.asc().nullsLast().op("text_ops"),
      table.type.asc().nullsLast().op("enum_ops"),
      table.name.asc().nullsLast().op("text_ops"),
    ),
  ],
)

export const botFieldModel = pgTable(
  "BotField",
  {
    ...sharedColumns,
    name: text().notNull(),
    type: customFieldType().notNull(),
    value: text(),
    description: text(),
    folderId: text().references(() => folderModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
      name: "BotField_folderId_fkey",
    }),
    chatbotId: text()
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "BotField_chatbotId_fkey",
      }),
  },
  (table) => [
    uniqueIndex("BotField_chatbotId_fieldType_name_key").using(
      "btree",
      table.chatbotId.asc().nullsLast().op("text_ops"),
      table.type.asc().nullsLast().op("enum_ops"),
      table.name.asc().nullsLast().op("text_ops"),
    ),
  ],
)

export const flowModel = pgTable("Flow", {
  ...sharedColumns,
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
  ...sharedColumns,
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
  ...sharedColumns,
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
  // biome-ignore lint/suspicious/noExplicitAny: use any
  nodes: jsonb().$type<any[]>().notNull(),
  // biome-ignore lint/suspicious/noExplicitAny: use any
  edges: jsonb().$type<any[]>().notNull(),
  isDraft: boolean().notNull(),
  isLatest: boolean().default(false).notNull(),
  startNodeId: text().notNull(),
})

export const folderModel = pgTable(
  "Folder",
  {
    ...sharedColumns,
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
    ...sharedColumns,
    name: text().notNull().default(""),
    channel: text().notNull(),
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
    uniqueIndex("Inbox_chatbotId_channel_sourceId_key").using(
      "btree",
      table.channel.asc().nullsLast().op("text_ops"),
      table.sourceId.asc().nullsLast().op("text_ops"),
    ),
  ],
)

export const inboxTeamModel = pgTable("InboxTeam", {
  ...sharedColumns,
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
  ...sharedColumns,
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
})

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
    conversationStarters: jsonb()
      .$type<MessengerConversationStarter>()
      .array()
      .default(sql`[]`)
      .notNull(),
    persistentMenus: jsonb()
      .$type<MessengerPersistentMenu>()
      .array()
      .default(sql`[]`)
      .notNull(),
    greetingMessages: jsonb()
      .$type<MessengerGreetingMessage>()
      .array()
      .default(sql`[]`)
      .notNull(),
    personas: jsonb()
      .$type<MessengerPersona>()
      .array()
      .default(sql`[]`)
      .notNull(),
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
    welcomeFlowId: text().references(() => flowModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
      name: "IntegrationMessenger_welcomeFlowId_fkey",
    }),
  },
  (table) => [
    index("IntegrationMessenger_chatbotId_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast().op("text_ops"),
    ),
    index("IntegrationMessenger_welcomeFlowId_idx").using(
      "btree",
      table.welcomeFlowId.asc().nullsLast().op("text_ops"),
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
    conversationStarters: jsonb()
      .$type<WebchatConversationStarter[]>()
      .notNull()
      .default(sql`[]`),
    persistentMenus: jsonb()
      .$type<WebchatPersistentMenu[]>()
      .notNull()
      .default(sql`[]`),
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

export const analyticsManifestStatusModel = pgTable("AnalyticsManifestStatus", {
  objectKey: varchar("objectKey", { length: 255 }).primaryKey(),
  status: analyticsStatusEnum("status").notNull(),
  attempts: integer("attempts").notNull().default(0),
  ingestedAt: timestamp("ingestedAt"),
  lastError: text("lastError"),
  createdAt: sharedColumns.createdAt,
  updatedAt: sharedColumns.updatedAt,
})

export const inboxContactStatsModel = pgTable("InboxContactStats", {
  inboxId: text("inboxId")
    .primaryKey()
    .references(() => inboxModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "InboxContactStats_inboxId_fkey",
    }),
  totalContacts: integer("totalContacts").notNull().default(0),
  updatedAt: sharedColumns.updatedAt,
})

export const integrationZaloModel = pgTable(
  "IntegrationZalo",
  {
    ...sharedColumns,
    auth: jsonb().$type<{ [x: string]: unknown }>().notNull(),
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
    ...sharedColumns,
    code: text().notNull(),
    permissions: jsonb().$type<ChatbotMemberPermissions>().notNull(),
    expiresAt: timestamp(timestampConfig).notNull(),
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
  ...sharedColumns,
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

export const savedReplyModel = pgTable("SavedReply", {
  ...sharedColumns,
  shortcut: text().notNull(),
  text: text().notNull(),
  userId: text()
    .notNull()
    .references(() => userModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "SavedReply_userId_fkey",
    }),
})

export const messageModel = pgTable(
  "Message",
  {
    ...sharedColumns,
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
    contentAttributes: jsonb().$type<{ [x: string]: unknown }>(),
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
    ...sharedColumns,
    name: text().notNull(),
    slug: text(),
    logo: text(),
    metadata: text(),
    domain: text(),
    supportEmail: text(),
    settings: jsonb().$type<OrganizationSettings>().default({}).notNull(),
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
  ...sharedColumns,
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
    ...sharedColumns,
    expiresAt: timestamp(timestampConfig).notNull(),
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
    ...sharedColumns,
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
    ...sharedColumns,
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
    ...sharedColumns,
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
  ...sharedColumns,
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: timestamp(timestampConfig).notNull(),
})

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

export const jwkModel = pgTable("jwks", {
  id: text().primaryKey(),
  publicKey: text().notNull(),
  privateKey: text().notNull(),
  createdAt: sharedColumns.createdAt,
  expiresAt: timestamp(timestampConfig),
})

export const reflinkModel = pgTable(
  "Reflink",
  {
    ...sharedColumns,
    name: text().notNull(),
    flowId: text()
      .notNull()
      .references(() => flowModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "Reflink_flowId_fkey",
      }),
    chatbotId: text()
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "Reflink_chatbotId_fkey",
      }),
    customFieldId: text().references(() => customFieldModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
      name: "Reflink_customFieldId_fkey",
    }),
  },
  (table) => [
    uniqueIndex("Reflink_chatbotId_name_key").using(
      "btree",
      table.chatbotId.asc().nullsLast().op("text_ops"),
      table.name.asc().nullsLast().op("text_ops"),
    ),
  ],
)

// Sequence Feature Tables
export const sequenceModel = pgTable(
  "Sequence",
  {
    ...sharedColumns,
    name: text().notNull(),
    folderId: text().references(() => folderModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "Sequence_folderId_fkey",
    }),
    active: boolean().notNull().default(true),
    subscribers: integer().notNull().default(0),
    messages: integer().notNull().default(0),
    openRate: doublePrecision().notNull().default(0),
    ctr: doublePrecision().notNull().default(0),
    chatbotId: text()
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "Sequence_chatbotId_fkey",
      }),
  },
  (table) => [
    index("Sequence_folderId_idx").on(table.folderId),
    uniqueIndex("Sequence_chatbotId_name_key").on(table.chatbotId, table.name),
  ],
)

export const sequenceStepModel = pgTable(
  "SequenceStep",
  {
    ...sharedColumns,
    order: integer().notNull(),
    delayDays: integer().notNull(),
    delayMinutes: integer().notNull().default(0),
    delayUnit: text().default("days"),
    specificDateTime: timestamp({ precision: 3 }),
    isActive: boolean().notNull().default(true),
    anytime: boolean().notNull().default(true),
    sendTimeStart: text(),
    sendTimeEnd: text(),
    sendDays: text().default(
      '["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]',
    ),
    flowId: text().references(() => flowModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "SequenceStep_flowId_fkey",
    }),
    sequenceId: text()
      .notNull()
      .references(() => sequenceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "SequenceStep_sequenceId_fkey",
      }),
  },
  (table) => [
    index("SequenceStep_sequenceId_idx").on(table.sequenceId),
    index("SequenceStep_flowId_idx").on(table.flowId),
  ],
)

export const contactsOnSequenceModel = pgTable(
  "ContactsOnSequence",
  {
    ...sharedColumns,
    enrolledAt: timestamp({ precision: 3 }).notNull().defaultNow(),
    completedAt: timestamp({ precision: 3 }),
    currentStep: integer().notNull().default(0),
    status: text().notNull().default("active"),
    nextRunAt: timestamp({ precision: 3 }),
    lastStepId: text(),
    nextStepId: text(),
    lockedAt: timestamp({ precision: 3 }),
    lockOwner: text(),
    errorCount: integer().notNull().default(0),
    lastError: text(),
    contactId: text()
      .notNull()
      .references(() => contactModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "ContactsOnSequence_contactId_fkey",
      }),
    sequenceId: text()
      .notNull()
      .references(() => sequenceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "ContactsOnSequence_sequenceId_fkey",
      }),
    chatbotId: text()
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "ContactsOnSequence_chatbotId_fkey",
      }),
  },
  (table) => [
    index("ContactsOnSequence_sequenceId_idx").on(table.sequenceId),
    index("ContactsOnSequence_contactId_idx").on(table.contactId),
    index("ContactsOnSequence_chatbotId_idx").on(table.chatbotId),
    index("ContactsOnSequence_status_nextRunAt_idx").on(
      table.status,
      table.nextRunAt,
    ),
    index("ContactsOnSequence_chatbotId_status_nextRunAt_idx").on(
      table.chatbotId,
      table.status,
      table.nextRunAt,
    ),
    uniqueIndex("ContactsOnSequence_contactId_sequenceId_chatbotId_key").on(
      table.contactId,
      table.sequenceId,
      table.chatbotId,
    ),
  ],
)

export const sequenceEventModel = pgTable(
  "SequenceEvent",
  {
    ...sharedColumns,
    occurredAt: timestamp({ precision: 3 }).notNull().defaultNow(),
    eventType: text().notNull(),
    payload: jsonb(),
    chatbotId: text().notNull(),
    sequenceId: text().notNull(),
    contactId: text().notNull(),
    stepId: text(),
    dispatchId: text(),
  },
  (table) => [
    index("SequenceEvent_chatbotId_occurredAt_idx").on(
      table.chatbotId,
      table.occurredAt,
    ),
    index("SequenceEvent_contactId_occurredAt_idx").on(
      table.contactId,
      table.occurredAt,
    ),
    index("SequenceEvent_sequenceId_eventType_idx").on(
      table.sequenceId,
      table.eventType,
    ),
  ],
)

export const sequenceDispatchModel = pgTable(
  "SequenceDispatch",
  {
    ...sharedColumns,
    runAtMs: bigint({ mode: "number" }).notNull().default(0),
    bucket: integer().notNull().default(0),
    status: text().notNull().default("pending"),
    idempotencyKey: text().notNull(),
    attempt: integer().notNull().default(0),
    lastError: text(),
    lockedAt: timestamp({ precision: 3 }),
    lockOwner: text(),
    completedAt: timestamp({ precision: 3 }),
    chatbotId: text().notNull(),
    sequenceId: text().notNull(),
    contactId: text().notNull(),
    stepId: text().notNull(),
    enrollmentId: text().notNull(),
  },
  (table) => [
    index("SequenceDispatch_status_runAtMs_idx").on(
      table.status,
      table.runAtMs,
    ),
    index("SequenceDispatch_chatbotId_status_runAtMs_idx").on(
      table.chatbotId,
      table.status,
      table.runAtMs,
    ),
    uniqueIndex("SequenceDispatch_idempotencyKey_key").on(
      table.idempotencyKey,
      table.chatbotId,
    ),
    index("SequenceDispatch_enrollmentId_idx").on(table.enrollmentId),
    index("SequenceDispatch_bucket_status_runAtMs_idx").on(
      table.bucket,
      table.status,
      table.runAtMs,
    ),
  ],
)

export const triggerModel = pgTable(
  "Trigger",
  {
    ...sharedColumns,
    name: text().notNull(),
    active: boolean().notNull().default(true),
    folderId: text().references(() => folderModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
      name: "Trigger_folderId_fkey",
    }),
    actions: jsonb().notNull().default(sql`'[]'`),
    chatbotId: text()
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "Trigger_chatbotId_fkey",
      }),
  },
  (table) => [
    uniqueIndex("Trigger_chatbotId_name_key").using(
      "btree",
      table.chatbotId.asc().nullsLast().op("text_ops"),
      table.name.asc().nullsLast().op("text_ops"),
    ),
    index("Trigger_chatbotId_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast().op("text_ops"),
    ),
    index("Trigger_folderId_idx").using(
      "btree",
      table.folderId.asc().nullsLast().op("text_ops"),
    ),
    index("Trigger_chatbotId_active_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast().op("text_ops"),
      table.active.asc().nullsLast().op("bool_ops"),
    ),
  ],
)

export const webhookModel = pgTable(
  "Webhook",
  {
    ...sharedColumns,
    name: text().notNull(),
    active: boolean().notNull().default(true),
    folderId: text().references(() => folderModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
      name: "Webhook_folderId_fkey",
    }),
    url: text().notNull(),
    chatbotId: text()
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "Webhook_chatbotId_fkey",
      }),
  },
  (table) => [
    index("Webhook_chatbotId_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast().op("text_ops"),
    ),
    index("Webhook_folderId_idx").using(
      "btree",
      table.folderId.asc().nullsLast().op("text_ops"),
    ),
    index("Webhook_chatbotId_active_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast().op("text_ops"),
      table.active.asc().nullsLast().op("bool_ops"),
    ),
  ],
)

export const conditionModel = pgTable(
  "Condition",
  {
    id: text().primaryKey(),
    createdAt: sharedColumns.createdAt,
    triggerId: text().references(() => triggerModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "Condition_triggerId_fkey",
    }),
    webhookId: text().references(() => webhookModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
      name: "Condition_webhookId_fkey",
    }),
    type: integer().notNull(),
    sourceId: text(),
    operator: varchar({ length: 255 }),
    value: jsonb(),
  },
  (table) => [
    index("Condition_type_sourceId_idx").using(
      "btree",
      table.type.asc().nullsLast().op("int4_ops"),
      table.sourceId.asc().nullsLast().op("text_ops"),
    ),
    index("Condition_triggerId_idx").using(
      "btree",
      table.triggerId.asc().nullsLast().op("text_ops"),
    ),
    index("Condition_webhookId_idx").using(
      "btree",
      table.webhookId.asc().nullsLast().op("text_ops"),
    ),
    index("Condition_type_sourceId_triggerId_idx").using(
      "btree",
      table.type.asc().nullsLast().op("int4_ops"),
      table.sourceId.asc().nullsLast().op("text_ops"),
      table.triggerId.asc().nullsLast().op("text_ops"),
    ),
    index("Condition_type_sourceId_webhookId_idx").using(
      "btree",
      table.type.asc().nullsLast().op("int4_ops"),
      table.sourceId.asc().nullsLast().op("text_ops"),
      table.webhookId.asc().nullsLast().op("text_ops"),
    ),
  ],
)

export const triggerStatsModel = pgTable(
  "TriggerStats",
  {
    id: text().primaryKey(),
    createdAt: sharedColumns.createdAt,
    triggerId: text()
      .notNull()
      .references(() => triggerModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "TriggerStats_triggerId_fkey",
      }),
    chatbotId: text()
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "TriggerStats_chatbotId_fkey",
      }),
    date: timestamp(timestampConfig).notNull(),
    totalContacts: integer().notNull().default(0),
    successCount: integer().notNull().default(0),
    failureCount: integer().notNull().default(0),
    totalExecutions: integer().notNull().default(0),
  },
  (table) => [
    uniqueIndex("TriggerStats_triggerId_date_key").using(
      "btree",
      table.triggerId.asc().nullsLast().op("text_ops"),
      table.date.asc().nullsLast().op("timestamp_ops"),
    ),
    index("TriggerStats_triggerId_date_idx").using(
      "btree",
      table.triggerId.asc().nullsLast().op("text_ops"),
      table.date.asc().nullsLast().op("timestamp_ops"),
    ),
    index("TriggerStats_chatbotId_date_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast().op("text_ops"),
      table.date.asc().nullsLast().op("timestamp_ops"),
    ),
  ],
)

export const triggerContactHistoryModel = pgTable(
  "TriggerContactHistory",
  {
    id: text().notNull(),
    createdAt: sharedColumns.createdAt,
    triggerId: text()
      .notNull()
      .references(() => triggerModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "TriggerContactHistory_triggerId_fkey",
      }),
    contactId: text()
      .notNull()
      .references(() => contactModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "TriggerContactHistory_contactId_fkey",
      }),
    chatbotId: text()
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "TriggerContactHistory_chatbotId_fkey",
      }),
    firstEnteredAt: timestamp(timestampConfig).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.id, table.contactId],
      name: "TriggerContactHistory_pkey",
    }),
    index("TriggerContactHistory_triggerId_contactId_idx").using(
      "btree",
      table.triggerId.asc().nullsLast().op("text_ops"),
      table.contactId.asc().nullsLast().op("text_ops"),
    ),
    index("TriggerContactHistory_contactId_idx").using(
      "btree",
      table.contactId.asc().nullsLast().op("text_ops"),
    ),
    index("TriggerContactHistory_chatbotId_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast().op("text_ops"),
    ),
  ],
)

export const triggerExecutionModel = pgTable(
  "TriggerExecution",
  {
    id: text().primaryKey(),
    createdAt: sharedColumns.createdAt,
    executedAt: timestamp(timestampConfig).defaultNow().notNull(),
    triggerId: text()
      .notNull()
      .references(() => triggerModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "TriggerExecution_triggerId_fkey",
      }),
    contactId: text()
      .notNull()
      .references(() => contactModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "TriggerExecution_contactId_fkey",
      }),
    chatbotId: text()
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "TriggerExecution_chatbotId_fkey",
      }),
  },
  (table) => [
    index("TriggerExecution_triggerId_contactId_idx").using(
      "btree",
      table.triggerId.asc().nullsLast().op("text_ops"),
      table.contactId.asc().nullsLast().op("text_ops"),
    ),
    index("TriggerExecution_chatbotId_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast().op("text_ops"),
    ),
  ],
)

export const whatsappMessageTemplateModel = pgTable(
  "WhatsappMessageTemplate",
  {
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
    // biome-ignore lint/suspicious/noExplicitAny: <type for components>
    components: jsonb().$type<any[]>().notNull().default(sql`'[]'::jsonb`),
  },
  (table) => [
    uniqueIndex(
      "WhatsappMessageTemplate_integrationWhatsappId_sourceId_key",
    ).using(
      "btree",
      table.integrationWhatsappId.asc().nullsLast().op("text_ops"),
      table.sourceId.asc().nullsLast().op("text_ops"),
    ),
  ],
)
