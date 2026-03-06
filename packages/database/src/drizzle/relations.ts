import { defineRelations } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "./schema"

export const relations = defineRelations(schema, (r) => ({
  aiTriggerModel: {
    integrationOpenAIS: r.many.integrationOpenAIModel({
      from: r.aiTriggerModel.id.through(r.aiTriggerToIntegrationOpenAIModel.a),
      to: r.integrationOpenAIModel.id.through(
        r.aiTriggerToIntegrationOpenAIModel.b,
      ),
    }),
    chatbot: r.one.chatbotModel({
      from: r.aiTriggerModel.chatbotId,
      to: r.chatbotModel.id,
    }),
  },
  integrationOpenAIModel: {
    aiTriggers: r.many.aiTriggerModel(),
    aiAgent: r.one.aiAgentModel({
      from: r.integrationOpenAIModel.aiAgentId,
      to: r.aiAgentModel.id,
    }),
    aiAssistant: r.one.aiAssistantModel({
      from: r.integrationOpenAIModel.aiAssistantId,
      to: r.aiAssistantModel.id,
    }),
    chatbot: r.one.chatbotModel({
      from: r.integrationOpenAIModel.chatbotId,
      to: r.chatbotModel.id,
    }),
    integration: r.one.integrationModel({
      from: r.integrationOpenAIModel.integrationId,
      to: r.integrationModel.id,
    }),
  },
  contactModel: {
    tags: r.many.tagModel({
      from: r.contactModel.id.through(r.contactsToTagsModel.contactId),
      to: r.tagModel.id.through(r.contactsToTagsModel.tagId),
    }),
    chatbot: r.one.chatbotModel({
      from: r.contactModel.chatbotId,
      to: r.chatbotModel.id,
    }),
    customFields: r.many.customFieldModel({
      from: r.contactModel.id.through(r.contactCustomFieldModel.contactId),
      to: r.customFieldModel.id.through(
        r.contactCustomFieldModel.customFieldId,
      ),
    }),
    users: r.many.userModel({
      from: r.contactModel.id.through(r.contactNoteModel.contactId),
      to: r.userModel.id.through(r.contactNoteModel.createdById),
    }),
    broadcasts: r.many.broadcastModel(),
    conversation: r.one.conversationModel(),
    errorLogs: r.many.errorLogModel(),
    contactCustomFields: r.many.contactCustomFieldModel(),
    contactNotes: r.many.contactNoteModel(),
  },
  tagModel: {
    contactsToTags: r.many.contactsToTagsModel({
      from: r.tagModel.id,
      to: r.contactsToTagsModel.tagId,
    }),
    contacts: r.many.contactModel({
      from: r.tagModel.id.through(r.contactsToTagsModel.tagId),
      to: r.contactModel.id.through(r.contactsToTagsModel.contactId),
    }),
  },
  accountModel: {
    user: r.one.userModel({
      from: r.accountModel.userId,
      to: r.userModel.id,
    }),
  },
  userModel: {
    accounts: r.many.accountModel(),
    chatbotsViaChatbotMember: r.many.chatbotModel({
      alias: "chatbot_id_user_id_via_chatbotMember",
    }),
    contacts: r.many.contactModel(),
    conversations: r.many.conversationModel(),
    conversationParticipants: r.many.conversationParticipantModel(),
    inboxTeamMembers: r.many.inboxTeamMemberModel(),
    invitations: r.many.invitationModel(),
    auditLogs: r.many.auditLogModel(),
    organizations: r.many.organizationModel(),
    sessions: r.many.sessionModel(),
    chatbotMembers: r.many.chatbotMemberModel(),
    inboxTeams: r.many.inboxTeamModel({
      from: r.userModel.id.through(r.inboxTeamMemberModel.userId),
      to: r.inboxTeamModel.id.through(r.inboxTeamMemberModel.inboxTeamId),
    }),
  },
  chatbotModel: {
    aiAgents: r.many.aiAgentModel(),
    aiAssistants: r.many.aiAssistantModel(),
    aiFilesViaAiEmbedding: r.many.aiFileModel({
      alias: "aiFile_id_chatbot_id_via_aiEmbedding",
    }),
    aiFilesChatbotId: r.many.aiFileModel({
      alias: "aiFile_chatbotId_chatbot_id",
    }),
    flowsViaAiFunction: r.many.flowModel({
      from: r.chatbotModel.id.through(r.aiFunctionModel.chatbotId),
      to: r.flowModel.id.through(r.aiFunctionModel.triggerFlowId),
      alias: "chatbot_id_flow_id_via_aiFunction",
    }),
    aiMCPServers: r.many.aiMCPServerModel(),
    aiTriggers: r.many.aiTriggerModel(),
    attachments: r.many.attachmentModel(),
    automatedResponses: r.many.automatedResponseModel(),
    flowsViaBroadcast: r.many.flowModel({
      from: r.chatbotModel.id.through(r.broadcastModel.chatbotId),
      to: r.flowModel.id.through(r.broadcastModel.flowId),
      alias: "chatbot_id_flow_id_via_broadcast",
    }),
    organization: r.one.organizationModel({
      from: r.chatbotModel.organizationId,
      to: r.organizationModel.id,
    }),
    usersViaChatbotMember: r.many.userModel({
      from: r.chatbotModel.id.through(r.chatbotMemberModel.chatbotId),
      to: r.userModel.id.through(r.chatbotMemberModel.userId),
      alias: "chatbot_id_user_id_via_chatbotMember",
    }),
    chatbotUsages: r.one.chatbotUsageModel(),
    contacts: r.many.contactModel(),
    conversations: r.many.conversationModel(),
    conversationParticipants: r.many.conversationParticipantModel(),
    foldersViaCustomField: r.many.folderModel({
      from: r.chatbotModel.id.through(r.customFieldModel.chatbotId),
      to: r.folderModel.id.through(r.customFieldModel.folderId),
      alias: "chatbot_id_folder_id_via_customField",
    }),
    foldersViaFlow: r.many.folderModel({
      from: r.chatbotModel.id.through(r.flowModel.chatbotId),
      to: r.folderModel.id.through(r.flowModel.folderId),
      alias: "chatbot_id_folder_id_via_flow",
    }),
    flowRuns: r.many.flowRunModel(),
    flowsViaFlowVersion: r.many.flowModel({
      from: r.chatbotModel.id.through(r.flowVersionModel.chatbotId),
      to: r.flowModel.id.through(r.flowVersionModel.flowId),
      alias: "chatbot_id_flow_id_via_flowVersion",
    }),
    foldersViaFolder: r.many.folderModel({
      from: r.chatbotModel.id.through(r.folderModel.chatbotId),
      to: r.folderModel.id.through(r.folderModel.parentId),
      alias: "chatbot_id_folder_id_via_folder",
    }),
    inboxesChatbotId: r.many.inboxModel({
      alias: "inbox_chatbotId_chatbot_id",
    }),
    inboxTeams: r.many.inboxTeamModel(),
    integrationsChatbotId: r.many.integrationModel({
      alias: "integration_chatbotId_chatbot_id",
    }),
    integrationsViaIntegrationGemini: r.many.integrationModel({
      from: r.chatbotModel.id.through(r.integrationGeminiModel.chatbotId),
      to: r.integrationModel.id.through(r.integrationGeminiModel.integrationId),
      alias: "chatbot_id_integration_id_via_integrationGemini",
    }),
    integrationsViaIntegrationGoogleSheets: r.many.integrationModel({
      from: r.chatbotModel.id.through(r.integrationGoogleSheetsModel.chatbotId),
      to: r.integrationModel.id.through(
        r.integrationGoogleSheetsModel.integrationId,
      ),
      alias: "chatbot_id_integration_id_via_integrationGoogleSheets",
    }),
    integrationMessengers: r.many.integrationMessengerModel(),
    integrationOpenAIS: r.many.integrationOpenAIModel(),
    integrationWebchats: r.many.integrationWebchatModel(),
    inboxesViaIntegrationWhatsapp: r.many.inboxModel({
      from: r.chatbotModel.id.through(r.integrationWhatsappModel.chatbotId),
      to: r.inboxModel.id.through(r.integrationWhatsappModel.inboxId),
      alias: "chatbot_id_inbox_id_via_integrationWhatsapp",
    }),
    integrationZalos: r.many.integrationZaloModel(),
    invitations: r.many.invitationModel(),
    errorLogs: r.many.errorLogModel(),
    auditLogs: r.many.auditLogModel(),
    messages: r.many.messageModel(),
    spreadsheets: r.many.spreadsheetModel(),
    foldersViaTag: r.many.folderModel({
      from: r.chatbotModel.id.through(r.tagModel.chatbotId),
      to: r.folderModel.id.through(r.tagModel.folderId),
      alias: "chatbot_id_folder_id_via_tag",
    }),
  },
  aiAgentModel: {
    chatbot: r.one.chatbotModel({
      from: r.aiAgentModel.chatbotId,
      to: r.chatbotModel.id,
    }),
    integrationOpenAIS: r.many.integrationOpenAIModel(),
  },
  aiAssistantModel: {
    chatbot: r.one.chatbotModel({
      from: r.aiAssistantModel.chatbotId,
      to: r.chatbotModel.id,
    }),
    integrationOpenAIS: r.many.integrationOpenAIModel(),
  },
  aiFileModel: {
    aiEmbeddings: r.many.aiEmbeddingModel(),
    chatbots: r.many.chatbotModel({
      from: r.aiFileModel.id.through(r.aiEmbeddingModel.aiFileId),
      to: r.chatbotModel.id.through(r.aiEmbeddingModel.chatbotId),
      alias: "aiFile_id_chatbot_id_via_aiEmbedding",
    }),
    chatbot: r.one.chatbotModel({
      from: r.aiFileModel.chatbotId,
      to: r.chatbotModel.id,
      alias: "aiFile_chatbotId_chatbot_id",
    }),
  },
  flowModel: {
    chatbotsViaAiFunction: r.many.chatbotModel({
      alias: "chatbot_id_flow_id_via_aiFunction",
    }),
    chatbotsViaBroadcast: r.many.chatbotModel({
      alias: "chatbot_id_flow_id_via_broadcast",
    }),
    flowRuns: r.many.flowRunModel(),
    flowVersions: r.many.flowVersionModel(),
    chatbotsViaFlowVersion: r.many.chatbotModel({
      alias: "chatbot_id_flow_id_via_flowVersion",
    }),
    integrationMessengers: r.many.integrationMessengerModel(),
    integrationWebchats: r.many.integrationWebchatModel(),
    integrationZalos: r.many.integrationZaloModel(),
    reflinks: r.many.reflinkModel(),
  },
  aiMCPServerModel: {
    chatbot: r.one.chatbotModel({
      from: r.aiMCPServerModel.chatbotId,
      to: r.chatbotModel.id,
    }),
  },
  attachmentModel: {
    chatbot: r.one.chatbotModel({
      from: r.attachmentModel.chatbotId,
      to: r.chatbotModel.id,
    }),
    conversation: r.one.conversationModel({
      from: r.attachmentModel.conversationId,
      to: r.conversationModel.id,
    }),
    message: r.one.messageModel({
      from: r.attachmentModel.messageId,
      to: r.messageModel.id,
    }),
  },
  conversationModel: {
    attachments: r.many.attachmentModel(),
    assignedInboxTeam: r.one.inboxTeamModel({
      from: r.conversationModel.assignedInboxTeamId,
      to: r.inboxTeamModel.id,
    }),
    assignedUser: r.one.userModel({
      from: r.conversationModel.assignedUserId,
      to: r.userModel.id,
    }),
    chatbot: r.one.chatbotModel({
      from: r.conversationModel.chatbotId,
      to: r.chatbotModel.id,
      optional: false,
    }),
    contact: r.one.contactModel({
      from: r.conversationModel.contactId,
      to: r.contactModel.id,
      optional: false,
    }),
    inbox: r.one.inboxModel({
      from: r.conversationModel.inboxId,
      to: r.inboxModel.id,
      optional: false,
    }),
    conversationParticipants: r.many.conversationParticipantModel(),
    flowRuns: r.many.flowRunModel(),
    messages: r.many.messageModel(),
  },
  messageModel: {
    attachments: r.many.attachmentModel(),
    chatbot: r.one.chatbotModel({
      from: r.messageModel.chatbotId,
      to: r.chatbotModel.id,
    }),
    conversation: r.one.conversationModel({
      from: r.messageModel.conversationId,
      to: r.conversationModel.id,
    }),
    inbox: r.one.inboxModel({
      from: r.messageModel.inboxId,
      to: r.inboxModel.id,
    }),
  },
  automatedResponseModel: {
    chatbot: r.one.chatbotModel({
      from: r.automatedResponseModel.chatbotId,
      to: r.chatbotModel.id,
    }),
  },
  organizationModel: {
    chatbots: r.many.chatbotModel(),
    invitations: r.many.invitationModel(),
    users: r.many.userModel({
      from: r.organizationModel.id.through(
        r.organizationMemberModel.organizationId,
      ),
      to: r.userModel.id.through(r.organizationMemberModel.userId),
    }),
  },
  chatbotUsageModel: {
    chatbot: r.one.chatbotModel({
      from: r.chatbotUsageModel.chatbotId,
      to: r.chatbotModel.id,
    }),
  },
  customFieldModel: {
    contacts: r.many.contactModel(),
    reflinks: r.many.reflinkModel(),
  },
  broadcastModel: {
    contactsOnBroadcasts: r.many.contactsOnBroadcastsModel(),
    contacts: r.many.contactModel({
      from: r.broadcastModel.id.through(
        r.contactsOnBroadcastsModel.broadcastId,
      ),
      to: r.contactModel.id.through(r.contactsOnBroadcastsModel.contactId),
    }),
  },
  inboxTeamModel: {
    conversations: r.many.conversationModel(),
    chatbot: r.one.chatbotModel({
      from: r.inboxTeamModel.chatbotId,
      to: r.chatbotModel.id,
    }),
    inboxTeamMembers: r.many.inboxTeamMemberModel(),
    users: r.many.userModel({
      from: r.inboxTeamModel.id.through(r.inboxTeamMemberModel.inboxTeamId),
      to: r.userModel.id.through(r.inboxTeamMemberModel.userId),
    }),
  },
  inboxModel: {
    conversations: r.many.conversationModel(),
    chatbot: r.one.chatbotModel({
      from: r.inboxModel.chatbotId,
      to: r.chatbotModel.id,
      alias: "inbox_chatbotId_chatbot_id",
      optional: false,
    }),
    integrationMessenger: r.one.integrationMessengerModel(),
    integrationWebchat: r.one.integrationWebchatModel(),
    chatbots: r.many.chatbotModel({
      alias: "chatbot_id_inbox_id_via_integrationWhatsapp",
    }),
    integrationZalo: r.one.integrationZaloModel(),
    messages: r.many.messageModel(),
    integrationWhatsapp: r.one.integrationWhatsappModel(),
    contactStats: r.one.inboxContactStatsModel(),
  },
  conversationParticipantModel: {
    chatbot: r.one.chatbotModel({
      from: r.conversationParticipantModel.chatbotId,
      to: r.chatbotModel.id,
    }),
    conversation: r.one.conversationModel({
      from: r.conversationParticipantModel.conversationId,
      to: r.conversationModel.id,
    }),
    user: r.one.userModel({
      from: r.conversationParticipantModel.userId,
      to: r.userModel.id,
    }),
  },
  folderModel: {},
  flowRunModel: {
    chatbot: r.one.chatbotModel({
      from: r.flowRunModel.chatbotId,
      to: r.chatbotModel.id,
    }),
    conversation: r.one.conversationModel({
      from: r.flowRunModel.conversationId,
      to: r.conversationModel.id,
    }),
    flow: r.one.flowModel({
      from: r.flowRunModel.flowId,
      to: r.flowModel.id,
    }),
    flowVersion: r.one.flowVersionModel({
      from: r.flowRunModel.flowVersionId,
      to: r.flowVersionModel.id,
    }),
  },
  flowVersionModel: {
    flowRuns: r.many.flowRunModel(),
    flow: r.one.flowModel({
      from: r.flowVersionModel.flowId,
      to: r.flowModel.id,
    }),
    chatbot: r.one.chatbotModel({
      from: r.flowVersionModel.chatbotId,
      to: r.chatbotModel.id,
    }),
  },
  inboxTeamMemberModel: {
    inboxTeam: r.one.inboxTeamModel({
      from: r.inboxTeamMemberModel.inboxTeamId,
      to: r.inboxTeamModel.id,
    }),
    user: r.one.userModel({
      from: r.inboxTeamMemberModel.userId,
      to: r.userModel.id,
    }),
  },
  integrationModel: {
    chatbot: r.one.chatbotModel({
      from: r.integrationModel.chatbotId,
      to: r.chatbotModel.id,
      alias: "integration_chatbotId_chatbot_id",
    }),
    chatbotsViaIntegrationGemini: r.many.chatbotModel({
      alias: "chatbot_id_integration_id_via_integrationGemini",
    }),
    chatbotsViaIntegrationGoogleSheets: r.many.chatbotModel({
      alias: "chatbot_id_integration_id_via_integrationGoogleSheets",
    }),
    integrationOpenAIS: r.one.integrationOpenAIModel(),
    integrationGoogleSheets: r.one.integrationGoogleSheetsModel(),
  },
  integrationMessengerModel: {
    chatbot: r.one.chatbotModel({
      from: r.integrationMessengerModel.chatbotId,
      to: r.chatbotModel.id,
      optional: false,
    }),
    flow: r.one.flowModel({
      from: r.integrationMessengerModel.fallbackFlowId,
      to: r.flowModel.id,
    }),
    inbox: r.one.inboxModel({
      from: r.integrationMessengerModel.inboxId,
      to: r.inboxModel.id,
      optional: false,
    }),
  },
  integrationWebchatModel: {
    chatbot: r.one.chatbotModel({
      from: r.integrationWebchatModel.chatbotId,
      to: r.chatbotModel.id,
      optional: false,
    }),
    inbox: r.one.inboxModel({
      from: r.integrationWebchatModel.inboxId,
      to: r.inboxModel.id,
      optional: false,
    }),
    flow: r.one.flowModel({
      from: r.integrationWebchatModel.welcomeFlowId,
      to: r.flowModel.id,
    }),
  },
  integrationZaloModel: {
    chatbot: r.one.chatbotModel({
      from: r.integrationZaloModel.chatbotId,
      to: r.chatbotModel.id,
      optional: false,
    }),
    flow: r.one.flowModel({
      from: r.integrationZaloModel.fallbackFlowId,
      to: r.flowModel.id,
    }),
    inbox: r.one.inboxModel({
      from: r.integrationZaloModel.inboxId,
      to: r.inboxModel.id,
      optional: false,
    }),
  },
  invitationModel: {
    chatbot: r.one.chatbotModel({
      from: r.invitationModel.chatbotId,
      to: r.chatbotModel.id,
    }),
    user: r.one.userModel({
      from: r.invitationModel.invitedBy,
      to: r.userModel.id,
    }),
    organization: r.one.organizationModel({
      from: r.invitationModel.organizationId,
      to: r.organizationModel.id,
    }),
  },
  errorLogModel: {
    chatbot: r.one.chatbotModel({
      from: r.errorLogModel.chatbotId,
      to: r.chatbotModel.id,
    }),
    contact: r.one.contactModel({
      from: r.errorLogModel.contactId,
      to: r.contactModel.id,
    }),
  },
  auditLogModel: {
    chatbot: r.one.chatbotModel({
      from: r.auditLogModel.chatbotId,
      to: r.chatbotModel.id,
    }),
    user: r.one.userModel({
      from: r.auditLogModel.userId,
      to: r.userModel.id,
    }),
  },
  sessionModel: {
    user: r.one.userModel({
      from: r.sessionModel.userId,
      to: r.userModel.id,
    }),
  },
  spreadsheetModel: {
    chatbot: r.one.chatbotModel({
      from: r.spreadsheetModel.chatbotId,
      to: r.chatbotModel.id,
    }),
  },
  whatsappFlowModel: {
    integrationWhatsapp: r.one.integrationWhatsappModel({
      from: r.whatsappFlowModel.integrationWhatsappId,
      to: r.integrationWhatsappModel.id,
    }),
  },
  integrationWhatsappModel: {
    chatbot: r.one.chatbotModel({
      from: r.integrationWhatsappModel.chatbotId,
      to: r.chatbotModel.id,
      optional: false,
    }),
    inbox: r.one.inboxModel({
      from: r.integrationWhatsappModel.inboxId,
      to: r.inboxModel.id,
      optional: false,
    }),
    whatsappFlows: r.many.whatsappFlowModel(),
    whatsappMessageTemplates: r.many.whatsappMessageTemplateModel(),
  },
  whatsappMessageTemplateModel: {
    integrationWhatsapp: r.one.integrationWhatsappModel({
      from: r.whatsappMessageTemplateModel.integrationWhatsappId,
      to: r.integrationWhatsappModel.id,
    }),
  },
  contactCustomFieldModel: {
    customField: r.one.customFieldModel({
      from: r.contactCustomFieldModel.customFieldId,
      to: r.customFieldModel.id,
      optional: false,
    }),
    contact: r.one.contactModel({
      from: r.contactCustomFieldModel.contactId,
      to: r.contactModel.id,
      optional: false,
    }),
  },
  chatbotMemberModel: {
    chatbot: r.one.chatbotModel({
      from: r.chatbotMemberModel.chatbotId,
      to: r.chatbotModel.id,
      optional: false,
    }),
    user: r.one.userModel({
      from: r.chatbotMemberModel.userId,
      to: r.userModel.id,
      optional: false,
    }),
  },
  contactNoteModel: {
    contact: r.one.contactModel({
      from: r.contactNoteModel.contactId,
      to: r.contactModel.id,
      optional: false,
    }),
    createdBy: r.one.userModel({
      from: r.contactNoteModel.createdById,
      to: r.userModel.id,
    }),
  },
  aiEmbeddingModel: {
    aiFile: r.one.aiFileModel({
      from: r.aiEmbeddingModel.aiFileId,
      to: r.aiFileModel.id,
    }),
  },
  integrationGoogleSheetsModel: {
    integration: r.one.integrationModel({
      from: r.integrationGoogleSheetsModel.integrationId,
      to: r.integrationModel.id,
    }),
  },
  integrationGeminiModel: {
    integration: r.one.integrationModel({
      from: r.integrationGeminiModel.integrationId,
      to: r.integrationModel.id,
    }),
  },
  contactsOnBroadcastsModel: {
    broadcast: r.one.broadcastModel({
      from: r.contactsOnBroadcastsModel.broadcastId,
      to: r.broadcastModel.id,
      optional: false,
    }),
    contact: r.one.contactModel({
      from: r.contactsOnBroadcastsModel.contactId,
      to: r.contactModel.id,
      optional: false,
    }),
  },
  contactsToTagsModel: {
    contact: r.one.contactModel({
      from: r.contactsToTagsModel.contactId,
      to: r.contactModel.id,
      optional: false,
    }),
    tag: r.one.tagModel({
      from: r.contactsToTagsModel.tagId,
      to: r.tagModel.id,
      optional: false,
    }),
  },
  reflinkModel: {
    flow: r.one.flowModel({
      from: r.reflinkModel.flowId,
      to: r.flowModel.id,
      optional: false,
    }),
    customField: r.one.customFieldModel({
      from: r.reflinkModel.customFieldId,
      to: r.customFieldModel.id,
    }),
  },
  triggerModel: {
    conditions: r.many.conditionModel(),
    chatbot: r.one.chatbotModel({
      from: r.triggerModel.chatbotId,
      to: r.chatbotModel.id,
    }),
  },
  webhookModel: {
    conditions: r.many.conditionModel(),
    chatbot: r.one.chatbotModel({
      from: r.webhookModel.chatbotId,
      to: r.chatbotModel.id,
    }),
  },
  conditionModel: {
    trigger: r.one.triggerModel({
      from: r.conditionModel.triggerId,
      to: r.triggerModel.id,
    }),
    webhook: r.one.webhookModel({
      from: r.conditionModel.webhookId,
      to: r.webhookModel.id,
    }),
  },
  inboxContactStatsModel: {
    inbox: r.one.inboxModel({
      from: r.inboxContactStatsModel.inboxId,
      to: r.inboxModel.id,
    }),
  },
}))
