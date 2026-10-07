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
import { botSimulatorPublicRouter } from "@/features/bot-simulator/api/public"
import { broadcastsPublicRouter } from "@/features/broadcasts/api/public"
import {
  capabilitiesPublicRouter,
  schemasPublicRouter,
} from "@/features/capabilities/api/public"
import {
  channelIntegrationsPublicRouter,
  createCapiRoutes,
  createChannelReadRoutes,
  createCoexistRoute,
  createHandoverResumeFlowRoute,
} from "@/features/channel-integrations/api/public"
import { channelPostsPublicRouter } from "@/features/channel-posts/api/public"
import {
  connectionProvidersPublicRouter,
  connectionsPublicRouter,
  connectSessionsPublicRouter,
} from "@/features/connections/api/public"
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
import { aiHandoverPublicRouter } from "@/features/integration-ai-handover/api/public"
import { channelsPublicRouter } from "@/features/integration-api/api/public"
import { instagramChannelsPublicRouter } from "@/features/integration-instagram/api/public"
import { messengerChannelsPublicRouter } from "@/features/integration-messenger/api/public"
import { messengerTemplatesPublicRouter } from "@/features/integration-messenger/message-templates/api/public"
import { smtpIntegrationsPublicRouter } from "@/features/integration-smtp/api/public"
import { tiktokChannelsPublicRouter } from "@/features/integration-tiktok/api/public"
import { webchatsPublicRouter } from "@/features/integration-webchat/api/public"
import { whatsappCallingPublicRouter } from "@/features/integration-whatsapp/calling/api/public"
import { whatsappFlowsPublicRouter } from "@/features/integration-whatsapp/flows/api/public"
import {
  templateMessagesPublicRouter,
  whatsappTemplatesPublicRouter,
} from "@/features/integration-whatsapp/message-templates/api/public"
import { zaloChannelsPublicRouter } from "@/features/integration-zalo/api/public"
import { integrationsPublicRouter } from "@/features/integrations/api/public"
import { magicLinksPublicRouter } from "@/features/magic-links/api/public"
import { mediaLibraryPublicRouter } from "@/features/media-library/api/public"
import { messagesPublicRouter } from "@/features/messages/api/public"
import { miniAppsPublicRouter } from "@/features/mini-apps/api/public"
import { minigamesPublicRouter } from "@/features/minigames/api/public"
import { messengerPersonasPublicRouter } from "@/features/personas/api/public"
import { productCategoriesPublicRouter } from "@/features/product-categories/api/public"
import { productsPublicRouter } from "@/features/products/api/public"
import { qrCodesPublicRouter } from "@/features/qr-codes/api/public"
import { questionnairesPublicRouter } from "@/features/questionnaires/api/public"
import { reflinksPublicRouter } from "@/features/reflinks/api/public"
import { savedRepliesPublicRouter } from "@/features/saved-replies/api/public"
import { sequencesPublicRouter } from "@/features/sequences/api/public"
import { commentAutomationsPublicRouter } from "@/features/shared/comment-automation/api/public"
import { spreadsheetsPublicRouter } from "@/features/spreadsheets/api/public"
import { tagsPublicRouter } from "@/features/tags/api/public"
import { threadsCommentsPublicRouter } from "@/features/threads-comments/api/public"
import { tiktokCommentsPublicRouter } from "@/features/tiktok-comments/api/public"
import { tokenPublicRouter } from "@/features/token/api/public"
import { triggersPublicRouter } from "@/features/triggers/api/public"
import { userPersistentMenusPublicRouter } from "@/features/user-persistent-menus/api/public"
import { webhooksPublicRouter } from "@/features/webhooks/api/public"
import { whatsappCallsPublicRouter } from "@/features/whatsapp-calls/api/public"
import { workspaceMembersPublicRouter } from "@/features/workspace-members/api/public"
import { workspaceSettingsPublicRouter } from "@/features/workspaces/api/public"

export const publicRouter = {
  ads: adsPublicRouter,
  aiAgents: aiAgentsPublicRouter,
  aiFiles: aiFilesPublicRouter,
  aiHandover: aiHandoverPublicRouter,
  aiFunctions: aiFunctionsPublicRouter,
  aiMcpServers: aiMcpServersPublicRouter,
  analytics: analyticsPublicRouter,
  appointmentCalendars: appointmentCalendarsPublicRouter,
  appointmentExternalCalendars: appointmentExternalCalendarsPublicRouter,
  appointmentReminders: appointmentRemindersPublicRouter,
  appointments: appointmentsPublicRouter,
  botFields: botFieldsPublicRouter,
  botSimulator: botSimulatorPublicRouter,
  broadcasts: broadcastsPublicRouter,
  capabilities: capabilitiesPublicRouter,
  channelPosts: channelPostsPublicRouter,
  channels: channelsPublicRouter,
  commentAutomations: commentAutomationsPublicRouter,
  connectionProviders: connectionProvidersPublicRouter,
  connections: connectionsPublicRouter,
  connectSessions: connectSessionsPublicRouter,
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
  channelIntegrations: channelIntegrationsPublicRouter,
  instagramChannels: {
    ...createChannelReadRoutes("instagram"),
    ...createCoexistRoute("instagram"),
    ...createCapiRoutes("instagram"),
    ...instagramChannelsPublicRouter,
  },
  inboxTeams: inboxTeamsPublicRouter,
  inboxes: inboxesPublicRouter,
  integrations: integrationsPublicRouter,
  keywords: keywordsPublicRouter,
  magicLinks: magicLinksPublicRouter,
  mediaLibrary: mediaLibraryPublicRouter,
  messages: messagesPublicRouter,
  messengerChannels: messengerChannelsPublicRouter,
  messengerPersonas: messengerPersonasPublicRouter,
  messengerTemplates: messengerTemplatesPublicRouter,
  miniApps: miniAppsPublicRouter,
  minigames: minigamesPublicRouter,
  productCategories: productCategoriesPublicRouter,
  products: productsPublicRouter,
  qrCodes: qrCodesPublicRouter,
  questionnaires: questionnairesPublicRouter,
  reflinks: reflinksPublicRouter,
  savedReplies: savedRepliesPublicRouter,
  schemas: schemasPublicRouter,
  sequences: sequencesPublicRouter,
  smtpIntegrations: smtpIntegrationsPublicRouter,
  spreadsheets: spreadsheetsPublicRouter,
  tags: tagsPublicRouter,
  templateMessages: templateMessagesPublicRouter,
  threadsComments: threadsCommentsPublicRouter,
  tiktokComments: tiktokCommentsPublicRouter,
  token: tokenPublicRouter,
  tiktokChannels: {
    ...createChannelReadRoutes("tiktok"),
    ...tiktokChannelsPublicRouter,
  },
  triggers: triggersPublicRouter,
  userPersistentMenus: userPersistentMenusPublicRouter,
  webchats: webchatsPublicRouter,
  webhooks: webhooksPublicRouter,
  whatsappCalls: whatsappCallsPublicRouter,
  whatsappFlows: whatsappFlowsPublicRouter,
  whatsappChannels: {
    ...createChannelReadRoutes("whatsapp"),
    ...createHandoverResumeFlowRoute("whatsapp"),
    ...createCoexistRoute("whatsapp"),
    ...createCapiRoutes("whatsapp"),
    ...whatsappCallingPublicRouter,
  },
  whatsappTemplates: whatsappTemplatesPublicRouter,
  workspaceMembers: workspaceMembersPublicRouter,
  workspaceSettings: workspaceSettingsPublicRouter,
  zaloChannels: zaloChannelsPublicRouter,
}
