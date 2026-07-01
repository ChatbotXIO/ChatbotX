import { analyticsRoutes } from "@chatbotx.io/analytics-nextjs/routes"
import { inboxTeamsAPI } from "@/enterprise/features/inbox-teams/api"
import { aiAgentsAPI } from "@/features/ai-agents/api"
import { aiFilesAPI } from "@/features/ai-files/api"
import { aiFunctionsAPI } from "@/features/ai-functions/api"
import { aiMcpServerAPIs } from "@/features/ai-mcp-servers/api"
import { keywordsAPI } from "@/features/automated-response/api"
import { botFieldAPIs } from "@/features/bot-fields/api"
import { broadcastAPIs } from "@/features/broadcasts/api"
import { contactsAPIs } from "@/features/contacts/api"
import { conversationsAPI } from "@/features/conversations/api"
import { customFieldsAPI } from "@/features/custom-fields/api"
import { emailTopicsAPI } from "@/features/email-topics/api"
import { errorLogsAPI } from "@/features/error-logs/api"
import { fbCommentsAPI } from "@/features/fb-comments/api"
import { flowsAPI } from "@/features/flows/api"
import { foldersAPI } from "@/features/folders/api"
import { inboxesAPI } from "@/features/inboxes/api"
import { integrationActiveCampaignAPI } from "@/features/integration-active-campaign/api"
import { integrationDripAPI } from "@/features/integration-drip/api"
import { integrationGetResponseAPI } from "@/features/integration-get-response/api"
import { integrationKlaviyoAPI } from "@/features/integration-klaviyo/api"
import { integrationMailchimpAPI } from "@/features/integration-mailchimp/api"
import { integrationMailerLiteAPI } from "@/features/integration-mailer-lite/api"
import { integrationMessengerAPIs } from "@/features/integration-messenger/api"
import { messengerMessageTemplateAPIs } from "@/features/integration-messenger/message-templates/api"
import { integrationMoosendAPI } from "@/features/integration-moosend/api"
import { integrationSendGridAPI } from "@/features/integration-sendgrid/api"
import { integrationSmtpAPI } from "@/features/integration-smtp/api"
import { integrationWhatsappAPIs } from "@/features/integration-whatsapp/api"
import { whatsappFlowAPIs } from "@/features/integration-whatsapp/flows/api"
import { whatsappMessageTemplateAPIs } from "@/features/integration-whatsapp/message-templates/api"
import { integrationsAPI } from "@/features/integrations/api"
import { messagesAPI } from "@/features/messages/api"
import { personasAPIs } from "@/features/personas/api"
import { platformCredentialsAPI } from "@/features/platform-credentials/api"
import { productsAPI } from "@/features/products/api"
import { savedRepliesAPI } from "@/features/saved-replies/api"
import { sequencesAPI } from "@/features/sequences/api"
import { spreadsheetsAPI } from "@/features/spreadsheets/api"
import { tagsAPI } from "@/features/tags/api"
import { triggersAPI } from "@/features/triggers/api"
import { userPersistentMenusAPI } from "@/features/user-persistent-menus/api"
import { webhooksAPI } from "@/features/webhooks/api"
import { workspaceMembersAPI } from "@/features/workspace-members/api"
import { workspacesAPI } from "@/features/workspaces/api"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"

export const router = {
  aiMcpServerAPIs,
  aiAgentsAPI,
  broadcastAPIs,
  conversationsAPI,
  emailTopicsAPI,
  tagsAPI,
  customFieldsAPI,
  flowsAPI,
  contactsAPIs,
  botFieldAPIs,
  analyticsRoutes: authorizedAPI
    // @ts-expect-error
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .router(analyticsRoutes),
  integrationActiveCampaignAPI,
  integrationDripAPI,
  integrationGetResponseAPI,
  integrationKlaviyoAPI,
  integrationMailchimpAPI,
  integrationMailerLiteAPI,
  integrationMessengerAPIs,
  integrationMoosendAPI,
  integrationSmtpAPI,
  integrationSendGridAPI,
  integrationWhatsappAPIs,
  whatsappMessageTemplateAPIs,
  whatsappFlowAPIs,
  messengerMessageTemplateAPIs,
  savedRepliesAPI,
  fbCommentsAPI,
  sequencesAPI,
  aiFilesAPI,
  inboxesAPI,
  spreadsheetsAPI,
  workspaceMembersAPI,
  inboxTeamsAPI,
  foldersAPI,
  messagesAPI,
  personasAPIs,
  errorLogsAPI,
  workspacesAPI,
  aiFunctionsAPI,
  platformCredentialsAPI,
  productsAPI,
  keywordsAPI,
  integrationsAPI,
  triggersAPI,
  userPersistentMenusAPI,
  webhooksAPI,
}
