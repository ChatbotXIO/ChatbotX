import z from "zod"
import type * as schema from "./drizzle/schema"

export * from "./drizzle/schema/organization-settings"

export const integrationType = {
  webchat: "webchat",
  googleSheets: "googleSheets",
  messenger: "messenger",
  openai: "openai",
  gemini: "gemini",
  whatsapp: "whatsapp",
  zalo: "zalo",
  chatbotX: "chatbotX",
} as const

export const channelType = {
  omnichannel: "omnichannel",
  webchat: "webchat",
  messenger: "messenger",
  whatsapp: "whatsapp",
  zalo: "zalo",
} as const
export type ChannelType = (typeof channelType)[keyof typeof channelType]

export type CancelDispatchReason = "enrollment_removed"
export const sequenceEventType = {
  dispatch_canceled: "dispatch_canceled",
  dispatch_rescheduled: "dispatch_rescheduled",
  dispatch_paused: "dispatch_paused",
  dispatch_resumed: "dispatch_resumed",
} as const

export type IntegrationWebchatModel =
  typeof schema.integrationWebchatModel.$inferSelect
export type UserModel = typeof schema.userModel.$inferSelect
export type AIAgentModel = typeof schema.aiAgentModel.$inferSelect
export type AIFunctionModel = typeof schema.aiFunctionModel.$inferSelect
export type AIMCPServerModel = typeof schema.aiMCPServerModel.$inferSelect
export type AITriggerModel = typeof schema.aiTriggerModel.$inferSelect
export type FieldModel = typeof schema.customFieldModel.$inferSelect
export type AutomatedResponseModel =
  typeof schema.automatedResponseModel.$inferSelect
export type FlowModel = typeof schema.flowModel.$inferSelect
export type FolderModel = typeof schema.folderModel.$inferSelect
export type TagModel = typeof schema.tagModel.$inferSelect
export type FlowVersionModel = typeof schema.flowVersionModel.$inferSelect
export type InvitationModel = typeof schema.invitationModel.$inferSelect
export type BroadcastModel = typeof schema.broadcastModel.$inferSelect
export type ChatbotMemberModel = typeof schema.chatbotMemberModel.$inferSelect
export type ChatbotUsageModel = typeof schema.chatbotUsageModel.$inferSelect
export type ContactModel = typeof schema.contactModel.$inferSelect
export type ConversationModel = typeof schema.conversationModel.$inferSelect
export type InboxModel = typeof schema.inboxModel.$inferSelect
export type IntegrationGeminiModel =
  typeof schema.integrationGeminiModel.$inferSelect
export type IntegrationModel = typeof schema.integrationModel.$inferSelect
export type IntegrationGoogleSheetsModel =
  typeof schema.integrationGoogleSheetsModel.$inferSelect
export type IntegrationMessengerModel =
  typeof schema.integrationMessengerModel.$inferSelect
export type IntegrationOpenAIModel =
  typeof schema.integrationOpenAIModel.$inferSelect
export type IntegrationWhatsappModel =
  typeof schema.integrationWhatsappModel.$inferSelect
export type IntegrationZaloModel =
  typeof schema.integrationZaloModel.$inferSelect
export type MessageModel = typeof schema.messageModel.$inferSelect
export type AttachmentModel = typeof schema.attachmentModel.$inferSelect
export type SpreadsheetModel = typeof schema.spreadsheetModel.$inferSelect
export type AIEmbeddingModel = typeof schema.aiEmbeddingModel.$inferSelect
export type AIFileModel = typeof schema.aiFileModel.$inferSelect
export type ContactCustomFieldModel =
  typeof schema.contactCustomFieldModel.$inferSelect
export type ChatbotModel = typeof schema.chatbotModel.$inferSelect
export type OrganizationModel = typeof schema.organizationModel.$inferSelect
export type ContactNoteModel = typeof schema.contactNoteModel.$inferSelect
export type InboxTeamModel = typeof schema.inboxTeamModel.$inferSelect
export type InboxTeamMemberModel =
  typeof schema.inboxTeamMemberModel.$inferSelect
export type ErrorLogModel = typeof schema.errorLogModel.$inferSelect
export type AuditLogModel = typeof schema.auditLogModel.$inferSelect
export type SequenceModel = typeof schema.sequenceModel.$inferSelect
export type SequenceStepModel = typeof schema.sequenceStepModel.$inferSelect
export type ContactsOnSequenceModel =
  typeof schema.contactsOnSequenceModel.$inferSelect
export type SequenceEventModel = typeof schema.sequenceEventModel.$inferSelect
export type SequenceDispatchModel =
  typeof schema.sequenceDispatchModel.$inferSelect
export type TriggerModel = typeof schema.triggerModel.$inferSelect
export type WebhookModel = typeof schema.webhookModel.$inferSelect
export type ConditionModel = typeof schema.conditionModel.$inferSelect
export type TriggerStatsModel = typeof schema.triggerStatsModel.$inferSelect
export type TriggerContactHistoryModel =
  typeof schema.triggerContactHistoryModel.$inferSelect
export type TriggerExecutionModel =
  typeof schema.triggerExecutionModel.$inferSelect

export type PlanModel = typeof schema.planModel.$inferSelect
export type FolderType = (typeof schema.folderType.enumValues)[number]
export type IntegrationType = keyof typeof integrationType
export type BroadcastSchedulesType =
  (typeof schema.broadcastSchedulesType.enumValues)[number]
export type FileType = (typeof schema.fileType.enumValues)[number]
export type CustomFieldType = (typeof schema.customFieldType.enumValues)[number]
export type Gender = (typeof schema.gender.enumValues)[number]
export type ChatbotMemberRole =
  (typeof schema.chatbotMemberRole.enumValues)[number]
export type SenderType = (typeof schema.senderType.enumValues)[number]
export type MessageType = (typeof schema.messageType.enumValues)[number]
export type ContentType = (typeof schema.contentType.enumValues)[number]
export type BroadcastStatus = (typeof schema.broadcastStatus.enumValues)[number]
export type AIEmbeddingStatus =
  (typeof schema.aiEmbeddingStatus.enumValues)[number]
export type CustomFieldModel = typeof schema.customFieldModel.$inferSelect
export type BotFieldModel = typeof schema.botFieldModel.$inferSelect
export type ReflinkModel = typeof schema.reflinkModel.$inferSelect
export type OrganizationMember =
  typeof schema.organizationMemberModel.$inferSelect

// export * from "./drizzle/schema/integrations"

export const Omnichannel = "omnichannel"

export const WEBCHAT_SOURCE_PREFIX = "cw:"

export const ReplyType = {
  Message: "R01",
  Flow: "R02",
} as const

export type ReplyMessage = {
  message: string
  type: typeof ReplyType.Message
  buttons: {
    url: string
    label: string
  }[]
}

export type ReplyFlow = {
  type: typeof ReplyType.Flow
  flowId: string
}

export const UploadMode = {
  link: "link",
  file: "file",
} as const
export type UploadMode = (typeof UploadMode)[keyof typeof UploadMode]

export const CardLayout = {
  vertical: "ver",
  horizontal: "hor",
} as const
export type CardLayout = (typeof CardLayout)[keyof typeof CardLayout]

export type AutomatedResponseReply = ReplyMessage | ReplyFlow

export const AIMcpServerAuthType = {
  none: "none",
  token: "token",
  header: "header",
} as const
export type AIMcpServerAuthType =
  (typeof AIMcpServerAuthType)[keyof typeof AIMcpServerAuthType]

export const AIMessageRole = {
  user: "user",
  assistant: "assistant",
  system: "system",
  developer: "developer",
} as const
export type AIMessageRole = (typeof AIMessageRole)[keyof typeof AIMessageRole]

export type AIAgentProvider = {
  provider: "openai" | "gemini"
  model: string
}

export const ConversationStarterType = {
  flow: "C01",
  message: "C02",
  website: "C03",
} as const
export type ConversationStarterType =
  (typeof ConversationStarterType)[keyof typeof ConversationStarterType]

export const PersistentMenuType = {
  flow: "P01",
  website: "P02",
} as const
export type PersistentMenuType =
  (typeof PersistentMenuType)[keyof typeof PersistentMenuType]

export const WhatsappTemplateCategory = {
  marketing: "MARKETING",
  utility: "UTILITY",
} as const
export type WhatsappTemplateCategory =
  (typeof WhatsappTemplateCategory)[keyof typeof WhatsappTemplateCategory]

export const reservedCustomFieldNames = {
  first_name: "first_name",
  last_name: "last_name",
  full_name: "full_name",
  email: "email",
  phone_number: "phone_number",
  avatar: "avatar",
  locale: "locale",
  gender: "gender",
  timezone: "timezone",
  user_id: "user_id",
  user_tags: "user_tags",
  account_name: "account_name",
  account_id: "account_id",
  page_user_name: "page_user_name",
  last_input: "last_input",
  current_time: "current_time",
} as const
export type ReservedCustomFieldNames =
  (typeof reservedCustomFieldNames)[keyof typeof reservedCustomFieldNames]

export const chatbotMemberPermissionsSchema = z.object({
  superAdmin: z.boolean(),
  analytics: z.boolean(),
  flows: z.boolean(),
  contacts: z.boolean(),
  onlyAssignedContacts: z.boolean(),
  emailAndPhone: z.boolean(),
  broadcast: z.boolean(),
  ecommerce: z.boolean(),
})
export type ChatbotMemberPermissions = z.infer<
  typeof chatbotMemberPermissionsSchema
>

export const chatbotMemberNotificationTypesSchema = z.object({
  notifyAdmin: z.boolean(),
  newMessageToHuman: z.boolean(),
  newOrder: z.boolean(),
})
export type ChatbotMemberNotificationTypes = z.infer<
  typeof chatbotMemberNotificationTypesSchema
>

export const chatbotMemberNotificationChannelsSchema = z.object({
  messenger: z.boolean(),
  email: z.boolean(),
  telegram: z.boolean(),
  browser: z.boolean(),
})
export type ChatbotMemberNotificationChannels = z.infer<
  typeof chatbotMemberNotificationChannelsSchema
>

export const fillableContactKeys = [
  "phoneNumber",
  "email",
  "firstName",
  "lastName",
  "gender",
] as const
export type FillableContactKeys = (typeof fillableContactKeys)[number]

export type ConversationAttributes = {
  phoneNumber?: string
  challenge?: {
    type: "step"
    data: {
      flowId: string
      flowVersionId?: string
      nodeId: string
      stepId: string
      attempts: number
      lastAttemptAt: Date
    }
  }
}
