import { z } from "zod"
import type * as schema from "./drizzle/schema"

export * from "./drizzle/schema/organization-settings"

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

export type FolderType = (typeof schema.folderType.enumValues)[number]
export type IntegrationType = keyof typeof schema.integrationTypes
export type BroadcastSchedulesType =
  (typeof schema.broadcastSchedulesType.enumValues)[number]
export type FileType = (typeof schema.fileType.enumValues)[number]
export type CustomFieldType = (typeof schema.customFieldType.enumValues)[number]
export type Gender = (typeof schema.gender.enumValues)[number]
export type ChatbotMemberRole =
  (typeof schema.chatbotMemberRoles.enumValues)[number]
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

export const WhatsappTemplateCategory = {
  marketing: "MARKETING",
  utility: "UTILITY",
} as const
export type WhatsappTemplateCategory =
  (typeof WhatsappTemplateCategory)[keyof typeof WhatsappTemplateCategory]

export const reservedCustomFieldNames = z.enum([
  "first_name",
  "last_name",
  "full_name",
  "email",
  "phone_number",
  "avatar",
  "locale",
  "gender",
  "timezone",
  "user_id",
  "user_tags",
  "account_name",
  "account_id",
  "page_user_name",
  "last_input",
  "current_time",
])
export type ReservedCustomFieldName = z.infer<typeof reservedCustomFieldNames>

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
      flowId: bigint
      flowVersionId?: bigint
      nodeId: bigint
      stepId: bigint
      attempts: number
      lastAttemptAt: Date
    }
  }
}
