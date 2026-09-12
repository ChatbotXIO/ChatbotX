import { inboxTeamsPublicRouter } from "@/enterprise/features/inbox-teams/api/public"
import { adsPublicRouter } from "@/features/ads/api/public"
import { aiAgentsPublicRouter } from "@/features/ai-agents/api/public"
import { aiFilesPublicRouter } from "@/features/ai-files/api/public"
import { aiFunctionsPublicRouter } from "@/features/ai-functions/api/public"
import { aiMcpServersPublicRouter } from "@/features/ai-mcp-servers/api/public"
import { analyticsPublicRouter } from "@/features/analytics/api/public"
import { appointmentCalendarsPublicRouter } from "@/features/appointment-calendars/api/public"
import { appointmentRemindersPublicRouter } from "@/features/appointment-management/api/public"
import { appointmentsPublicRouter } from "@/features/appointments/api/public"
import { keywordsPublicRouter } from "@/features/automated-response/api/public"
import { botFieldsPublicRouter } from "@/features/bot-fields/api/public"
import { broadcastsPublicRouter } from "@/features/broadcasts/api/public"
import { contactScanPublicRouter } from "@/features/contact-scan/api/public"
import { contactsPublicRouter } from "@/features/contacts/api/public"
import { conversationsPublicRouter } from "@/features/conversations/api/public"
import { couponsPublicRouter } from "@/features/coupons/api/public"
import { customFieldsPublicRouter } from "@/features/custom-fields/api/public"
import { dynamicImagesPublicRouter } from "@/features/dynamic-images/api/public"
import { emailTopicsPublicRouter } from "@/features/email-topics/api/public"
import { errorLogsPublicRouter } from "@/features/error-logs/api/public"
import { appointmentExternalCalendarsPublicRouter } from "@/features/external-calendars/api/public"
import { externalWebhooksPublicRouter } from "@/features/external-webhooks/api/public"
import { facebookLeadAdsPublicRouter } from "@/features/facebook-lead-ad-automation/api/public"
import { fbCommentsPublicRouter } from "@/features/fb-comments/api/public"
import { flowsPublicRouter } from "@/features/flows/api/public"
import { foldersPublicRouter } from "@/features/folders/api/public"
import { igCommentsPublicRouter } from "@/features/ig-comments/api/public"
import { igStoriesPublicRouter } from "@/features/ig-stories/api/public"
import { inboxesPublicRouter } from "@/features/inboxes/api/public"
import { channelsPublicRouter } from "@/features/integration-api/api/public"
import { messengerChannelsPublicRouter } from "@/features/integration-messenger/api/public"
import { smtpIntegrationsPublicRouter } from "@/features/integration-smtp/api/public"
import { webchatsPublicRouter } from "@/features/integration-webchat/api/public"
import { templateMessagesPublicRouter } from "@/features/integration-whatsapp/message-templates/api/public"
import { zaloChannelsPublicRouter } from "@/features/integration-zalo/api/public"
import { integrationsPublicRouter } from "@/features/integrations/api/public"
import { mediaLibraryPublicRouter } from "@/features/media-library/api/public"
import { messagesPublicRouter } from "@/features/messages/api/public"
import { minigamesPublicRouter } from "@/features/minigames/api/public"
import { messengerPersonasPublicRouter } from "@/features/personas/api/public"
import { productCategoriesPublicRouter } from "@/features/product-categories/api/public"
import { productsPublicRouter } from "@/features/products/api/public"
import { qrCodesPublicRouter } from "@/features/qr-codes/api/public"
import { questionnairesPublicRouter } from "@/features/questionnaires/api/public"
import { reflinksPublicRouter } from "@/features/reflinks/api/public"
import { savedRepliesPublicRouter } from "@/features/saved-replies/api/public"
import { sequencesPublicRouter } from "@/features/sequences/api/public"
import { spreadsheetsPublicRouter } from "@/features/spreadsheets/api/public"
import { tagsPublicRouter } from "@/features/tags/api/public"
import { triggersPublicRouter } from "@/features/triggers/api/public"
import { userPersistentMenusPublicRouter } from "@/features/user-persistent-menus/api/public"
import { webhooksPublicRouter } from "@/features/webhooks/api/public"
import { workspaceMembersPublicRouter } from "@/features/workspace-members/api/public"

export const publicRouter = {
  ads: adsPublicRouter,
  aiAgents: aiAgentsPublicRouter,
  aiFiles: aiFilesPublicRouter,
  aiFunctions: aiFunctionsPublicRouter,
  aiMcpServers: aiMcpServersPublicRouter,
  analytics: analyticsPublicRouter,
  appointmentCalendars: appointmentCalendarsPublicRouter,
  appointmentExternalCalendars: appointmentExternalCalendarsPublicRouter,
  appointmentReminders: appointmentRemindersPublicRouter,
  appointments: appointmentsPublicRouter,
  botFields: botFieldsPublicRouter,
  broadcasts: broadcastsPublicRouter,
  channels: channelsPublicRouter,
  contactScans: contactScanPublicRouter,
  contacts: contactsPublicRouter,
  conversations: conversationsPublicRouter,
  coupons: couponsPublicRouter,
  customFields: customFieldsPublicRouter,
  dynamicImages: dynamicImagesPublicRouter,
  emailTopics: emailTopicsPublicRouter,
  errorLogs: errorLogsPublicRouter,
  externalWebhooks: externalWebhooksPublicRouter,
  facebookLeadAds: facebookLeadAdsPublicRouter,
  fbComments: fbCommentsPublicRouter,
  flows: flowsPublicRouter,
  folders: foldersPublicRouter,
  igComments: igCommentsPublicRouter,
  igStories: igStoriesPublicRouter,
  inboxTeams: inboxTeamsPublicRouter,
  inboxes: inboxesPublicRouter,
  integrations: integrationsPublicRouter,
  keywords: keywordsPublicRouter,
  mediaLibrary: mediaLibraryPublicRouter,
  messages: messagesPublicRouter,
  messengerChannels: messengerChannelsPublicRouter,
  messengerPersonas: messengerPersonasPublicRouter,
  minigames: minigamesPublicRouter,
  productCategories: productCategoriesPublicRouter,
  products: productsPublicRouter,
  qrCodes: qrCodesPublicRouter,
  questionnaires: questionnairesPublicRouter,
  reflinks: reflinksPublicRouter,
  savedReplies: savedRepliesPublicRouter,
  sequences: sequencesPublicRouter,
  smtpIntegrations: smtpIntegrationsPublicRouter,
  spreadsheets: spreadsheetsPublicRouter,
  tags: tagsPublicRouter,
  templateMessages: templateMessagesPublicRouter,
  triggers: triggersPublicRouter,
  userPersistentMenus: userPersistentMenusPublicRouter,
  webchats: webchatsPublicRouter,
  webhooks: webhooksPublicRouter,
  workspaceMembers: workspaceMembersPublicRouter,
  zaloChannels: zaloChannelsPublicRouter,
}
