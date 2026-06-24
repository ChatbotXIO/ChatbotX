import { aiAgentRelations } from "./ai-agent"
import { aiAssistantRelations } from "./ai-assistant"
import { aiConversationSourceRelations } from "./ai-conversation-source"
import { aiEmbeddingRelations } from "./ai-embedding"
import { aiFileRelations } from "./ai-file"
import { aiFunctionRelations } from "./ai-function"
import { aiMCPServerRelations } from "./ai-mcp-server"
import { aiTriggerRelations } from "./ai-trigger"
import {
  analyticsBotMessageEventRelations,
  analyticsBroadcastEventRelations,
  analyticsContactEventRelations,
  analyticsConversationEventRelations,
  analyticsFlowNodeEventRelations,
  analyticsSequenceEventRelations,
} from "./analytics"
import { analyticsEmailTopicRelations } from "./analytics-email-topic"
import { attachmentRelations } from "./attachment"
import { accountRelations } from "./auth-account"
import { invitationRelations } from "./auth-invitation"
import { sessionRelations } from "./auth-session"
import { automatedResponseRelations } from "./automated-response"
import { botFieldRelations } from "./bot-field"
import { broadcastRelations } from "./broadcast"
import { coexistSyncRunRelations } from "./coexist-sync-run"
import { contactRelations } from "./contact"
import { contactCustomFieldRelations } from "./contact-custom-field"
import { contactInboxRelations } from "./contact-inbox"
import { contactNoteRelations } from "./contact-note"
import { contactsOnBroadcastsRelations } from "./contact-on-broadcast"
import { contactsOnSequenceRelations } from "./contact-on-sequence"
import { contactOnSmartDelayRelations } from "./contact-on-smart-delay"
import { contactsToTagsRelations } from "./contact-to-tag"
import { contactToTagChannelRelations } from "./contact-to-tag-channel"
import { conversationRelations } from "./conversation"
import { conversationParticipantRelations } from "./conversation-participant"
import { platformCredentialRelations } from "./credential"
import { customFieldRelations } from "./custom-field"
import { emailTopicRelations } from "./email-topic"
import { auditLogRelations } from "./enterprise/audit-log"
import { customDomainRelations } from "./enterprise/custom-domain"
import { tenantRelations } from "./enterprise/tenant"
import { tenantQuotaUsageRelations } from "./enterprise/tenant-quota-usage"
import { userQuotaRelations } from "./enterprise/user-quota"
import { errorLogRelations } from "./error-log"
import { fileRelations } from "./file"
import { flowRelations } from "./flow"
import { flowAnalyticsSessionRelations } from "./flow-analytics-session"
import { flowNodeStatRelations } from "./flow-node-stat"
import { flowRunRelations } from "./flow-run"
import { flowVersionRelations } from "./flow-version"
import { folderRelations } from "./folder"
import { importRelations } from "./import"
import { inboxRelations } from "./inbox"
import { inboxContactStatsRelations } from "./inbox-contact-stats"
import { inboxTeamRelations } from "./inbox-team"
import { inboxTeamMemberRelations } from "./inbox-team-member"
import { integrationRelations } from "./integration"
import { integrationActiveCampaignRelations } from "./integration-active-campaign"
import { integrationClaudeRelations } from "./integration-claude"
import { integrationDeepseekRelations } from "./integration-deepseek"
import { integrationDripRelations } from "./integration-drip"
import { integrationGeminiRelations } from "./integration-gemini"
import { integrationGetResponseRelations } from "./integration-get-response"
import { integrationGoogleSheetsRelations } from "./integration-google-sheets"
import { integrationInstagramRelations } from "./integration-instagram"
import { integrationKlaviyoRelations } from "./integration-klaviyo"
import { integrationMailchimpRelations } from "./integration-mailchimp"
import { integrationMailerLiteRelations } from "./integration-mailer-lite"
import { integrationMessengerRelations } from "./integration-messenger"
import { integrationMoosendRelations } from "./integration-moosend"
import { integrationOpenaiRelations } from "./integration-openai"
import { integrationOpenrouterRelations } from "./integration-openrouter"
import { integrationSendGridRelations } from "./integration-sendgrid"
import { integrationSmtpRelations } from "./integration-smtp"
import { integrationTelegramRelations } from "./integration-telegram"
import { integrationTiktokRelations } from "./integration-tiktok"
import { integrationWebchatRelations } from "./integration-webchat"
import { integrationWhatsappRelations } from "./integration-whatsapp"
import { integrationZaloRelations } from "./integration-zalo"
import { magicLinkRelations } from "./magic-link"
import { messageRelations } from "./message"
import { messengerMessageTemplateRelations } from "./messenger-message-template"
import { productRelations } from "./product"
import { reflinkRelations } from "./reflink"
import { savedReplyRelations } from "./save-reply"
import { sequenceRelations } from "./sequence"
import { sequenceDispatchRelations } from "./sequence-dispatch"
import { sequenceStepRelations } from "./sequence-step"
import { spreadsheetRelations } from "./spreadsheet"
import { tagRelations } from "./tag"
import { tagChannelRelations } from "./tag-channel"
import { triggerRelations } from "./trigger"
import { conditionRelations } from "./trigger-condition"
import { triggerContactHistoryRelations } from "./trigger-contact-history"
import { triggerExecutionRelations } from "./trigger-execution"
import { triggerStatsRelations } from "./trigger-stats"
import { userRelations } from "./user"
import { userPersistentMenuRelations } from "./user-persistent-menu"
import { webhookRelations } from "./webhook"
import { whatsappFlowRelations } from "./whatsapp-flow"
import { whatsappMessageTemplateRelations } from "./whatsapp-message-template"
import { workspaceRelations } from "./workspace"
import { workspaceMemberRelations } from "./workspace-member"

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
  ...aiConversationSourceRelations,
  ...aiFileRelations,
  ...flowRelations,
  ...aiMCPServerRelations,
  ...attachmentRelations,
  ...conversationRelations,
  ...messageRelations,
  ...automatedResponseRelations,
  ...customDomainRelations,
  ...tenantRelations,
  ...tenantQuotaUsageRelations,
  ...platformCredentialRelations,
  ...userQuotaRelations,
  ...contactCustomFieldRelations,
  ...customFieldRelations,
  ...broadcastRelations,
  ...inboxTeamRelations,
  ...inboxRelations,
  ...conversationParticipantRelations,
  ...folderRelations,
  ...importRelations,
  ...fileRelations,
  ...flowRunRelations,
  ...flowVersionRelations,
  ...inboxTeamMemberRelations,
  ...integrationRelations,
  ...integrationMessengerRelations,
  ...messengerMessageTemplateRelations,
  ...integrationWebchatRelations,
  ...integrationZaloRelations,
  ...invitationRelations,
  ...emailTopicRelations,
  ...analyticsEmailTopicRelations,
  ...errorLogRelations,
  ...auditLogRelations,
  ...sessionRelations,
  ...spreadsheetRelations,
  ...whatsappFlowRelations,
  ...integrationWhatsappRelations,
  ...whatsappMessageTemplateRelations,
  ...workspaceMemberRelations,
  ...contactNoteRelations,
  ...aiEmbeddingRelations,
  ...integrationGoogleSheetsRelations,
  ...integrationSmtpRelations,
  ...integrationClaudeRelations,
  ...integrationDeepseekRelations,
  ...integrationGeminiRelations,
  ...integrationOpenrouterRelations,
  ...contactsOnBroadcastsRelations,
  ...contactsToTagsRelations,
  ...tagChannelRelations,
  ...contactToTagChannelRelations,
  ...reflinkRelations,
  ...magicLinkRelations,
  ...sequenceRelations,
  ...sequenceStepRelations,
  ...contactsOnSequenceRelations,
  ...sequenceDispatchRelations,
  ...inboxContactStatsRelations,
  ...triggerRelations,
  ...webhookRelations,
  ...conditionRelations,
  ...triggerStatsRelations,
  ...triggerContactHistoryRelations,
  ...triggerExecutionRelations,
  ...contactInboxRelations,
  ...aiFunctionRelations,
  ...botFieldRelations,
  ...savedReplyRelations,
  ...integrationTelegramRelations,
  ...integrationTiktokRelations,
  ...integrationInstagramRelations,
  ...integrationActiveCampaignRelations,
  ...integrationKlaviyoRelations,
  ...integrationMailchimpRelations,
  ...integrationMailerLiteRelations,
  ...integrationMoosendRelations,
  ...integrationDripRelations,
  ...integrationGetResponseRelations,
  ...integrationSendGridRelations,
  ...flowAnalyticsSessionRelations,
  ...flowNodeStatRelations,
  ...contactOnSmartDelayRelations,
  ...analyticsContactEventRelations,
  ...analyticsBotMessageEventRelations,
  ...analyticsConversationEventRelations,
  ...analyticsBroadcastEventRelations,
  ...analyticsSequenceEventRelations,
  ...analyticsFlowNodeEventRelations,
  ...productRelations,
  ...coexistSyncRunRelations,
  ...userPersistentMenuRelations,
}
