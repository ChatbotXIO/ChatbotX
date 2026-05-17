import { aiAgentRelations } from "./ai-agent"
import { aiAssistantRelations } from "./ai-assistant"
import { aiEmbeddingRelations } from "./ai-embedding"
import { aiFileRelations } from "./ai-file"
import { aiFunctionRelations } from "./ai-function"
import { aiMCPServerRelations } from "./ai-mcp-server"
import { aiTriggerRelations } from "./ai-trigger"
import { attachmentRelations } from "./attachment"
import { auditLogRelations } from "./audit-log"
import { accountRelations } from "./auth-account"
import { invitationRelations } from "./auth-invitation"
import { sessionRelations } from "./auth-session"
import { automatedResponseRelations } from "./automated-response"
import { botFieldRelations } from "./bot-field"
import { broadcastRelations } from "./broadcast"
import { contactRelations } from "./contact"
import { contactCustomFieldRelations } from "./contact-custom-field"
import { contactInboxRelations } from "./contact-inbox"
import { contactNoteRelations } from "./contact-note"
import { contactsOnBroadcastsRelations } from "./contact-on-broadcast"
import { contactsOnSequenceRelations } from "./contact-on-sequence"
import { contactOnSmartDelayRelations } from "./contact-on-smart-delay"
import { contactsToTagsRelations } from "./contact-to-tag"
import { conversationRelations } from "./conversation"
import { conversationParticipantRelations } from "./conversation-participant"
import { customFieldRelations } from "./custom-field"
import { errorLogRelations } from "./error-log"
import { flowRelations } from "./flow"
import { flowAnalyticsSessionRelations } from "./flow-analytics-session"
import { flowNodeStatRelations } from "./flow-node-stat"
import { flowRunRelations } from "./flow-run"
import { flowVersionRelations } from "./flow-version"
import { folderRelations } from "./folder"
import { inboxRelations } from "./inbox"
import { inboxContactStatsRelations } from "./inbox-contact-stats"
import { inboxTeamRelations } from "./inbox-team"
import { inboxTeamMemberRelations } from "./inbox-team-member"
import { integrationRelations } from "./integration"
import { integrationGeminiRelations } from "./integration-gemini"
import { integrationGoogleSheetsRelations } from "./integration-google-sheets"
import { integrationInstagramRelations } from "./integration-instagram"
import { integrationMessengerRelations } from "./integration-messenger"
import { integrationOpenaiRelations } from "./integration-openai"
import { integrationSmtpRelations } from "./integration-smtp"
import { integrationTelegramRelations } from "./integration-telegram"
import { integrationWebchatRelations } from "./integration-webchat"
import { integrationWhatsappRelations } from "./integration-whatsapp"
import { integrationZaloRelations } from "./integration-zalo"
import { magicLinkRelations } from "./magic-link"
import { messageRelations } from "./message"
import { organizationRelations } from "./organization"
import { organizationCredentialRelations } from "./organization-credential"
import { organizationMemberRelations } from "./organization-member"
import { planRelations } from "./plan"
import { reflinkRelations } from "./reflink"
import { savedReplyRelations } from "./save-reply"
import { sequenceRelations } from "./sequence"
import { sequenceDispatchRelations } from "./sequence-dispatch"
import { sequenceStepRelations } from "./sequence-step"
import { spreadsheetRelations } from "./spreadsheet"
import { tagRelations } from "./tag"
import { triggerRelations } from "./trigger"
import { conditionRelations } from "./trigger-condition"
import { triggerContactHistoryRelations } from "./trigger-contact-history"
import { triggerExecutionRelations } from "./trigger-execution"
import { triggerStatsRelations } from "./trigger-stats"
import { userRelations } from "./user"
import { webhookRelations } from "./webhook"
import { whatsappFlowRelations } from "./whatsapp-flow"
import { whatsappMessageTemplateRelations } from "./whatsapp-message-template"
import { workspaceRelations } from "./workspace"
import { workspaceMemberRelations } from "./workspace-member"
import { workspaceUsageRelations } from "./workspace-usage"

export const relations = {
  ...aiTriggerRelations,
  ...integrationOpenaiRelations,
  ...contactRelations,
  ...tagRelations,
  ...accountRelations,
  ...userRelations,
  ...workspaceRelations,
  ...aiAgentRelations,
  ...aiAssistantRelations,
  ...aiFileRelations,
  ...flowRelations,
  ...aiMCPServerRelations,
  ...attachmentRelations,
  ...conversationRelations,
  ...messageRelations,
  ...automatedResponseRelations,
  ...organizationRelations,
  ...organizationCredentialRelations,
  ...workspaceUsageRelations,
  ...contactCustomFieldRelations,
  ...customFieldRelations,
  ...broadcastRelations,
  ...inboxTeamRelations,
  ...inboxRelations,
  ...conversationParticipantRelations,
  ...folderRelations,
  ...flowRunRelations,
  ...flowVersionRelations,
  ...inboxTeamMemberRelations,
  ...integrationRelations,
  ...integrationMessengerRelations,
  ...integrationWebchatRelations,
  ...integrationZaloRelations,
  ...invitationRelations,
  ...errorLogRelations,
  ...auditLogRelations,
  ...sessionRelations,
  ...spreadsheetRelations,
  ...whatsappFlowRelations,
  ...integrationWhatsappRelations,
  ...whatsappMessageTemplateRelations,
  ...contactCustomFieldRelations,
  ...workspaceMemberRelations,
  ...contactNoteRelations,
  ...aiEmbeddingRelations,
  ...integrationGoogleSheetsRelations,
  ...integrationSmtpRelations,
  ...integrationGeminiRelations,
  ...contactsOnBroadcastsRelations,
  ...contactsToTagsRelations,
  ...reflinkRelations,
  ...magicLinkRelations,
  ...sequenceRelations,
  ...sequenceStepRelations,
  ...contactsOnSequenceRelations,
  ...sequenceDispatchRelations,
  ...inboxContactStatsRelations,
  ...organizationMemberRelations,
  ...triggerRelations,
  ...webhookRelations,
  ...conditionRelations,
  ...triggerStatsRelations,
  ...triggerContactHistoryRelations,
  ...triggerExecutionRelations,
  ...contactInboxRelations,
  ...planRelations,
  ...aiFunctionRelations,
  ...botFieldRelations,
  ...savedReplyRelations,
  ...userRelations,
  ...integrationTelegramRelations,
  ...integrationInstagramRelations,
  ...flowAnalyticsSessionRelations,
  ...flowNodeStatRelations,
  ...contactOnSmartDelayRelations,
}
