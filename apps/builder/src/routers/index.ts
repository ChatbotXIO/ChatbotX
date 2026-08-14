import { analyticsRoutes } from "@chatbotx.io/analytics-nextjs/routes"
import { lazy } from "@orpc/server"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"

// Every feature branch is a lazy router: the feature's api module (and its
// import graph) only loads on the first call that targets it, instead of all
// ~58 feature api modules loading with the route handler. Keeps server cold
// start and the rpc/api route chunks small. See .agents/rules/no-dynamic-import.md
// — dynamic import() is allowed in apps/builder (Next.js-built).
export const router = {
  adsAPI: lazy(() =>
    import("@/features/ads/api").then((m) => ({ default: m.adsAPI })),
  ),
  appointmentCalendarsAPI: lazy(() =>
    import("@/features/appointment-calendars/api").then((m) => ({
      default: m.appointmentCalendarsAPI,
    })),
  ),
  appointmentsAPI: lazy(() =>
    import("@/features/appointments/api").then((m) => ({
      default: m.appointmentsAPI,
    })),
  ),
  aiMcpServerAPIs: lazy(() =>
    import("@/features/ai-mcp-servers/api").then((m) => ({
      default: m.aiMcpServerAPIs,
    })),
  ),
  aiAgentsAPI: lazy(() =>
    import("@/features/ai-agents/api").then((m) => ({
      default: m.aiAgentsAPI,
    })),
  ),
  broadcastAPIs: lazy(() =>
    import("@/features/broadcasts/api").then((m) => ({
      default: m.broadcastAPIs,
    })),
  ),
  conversationsAPI: lazy(() =>
    import("@/features/conversations/api").then((m) => ({
      default: m.conversationsAPI,
    })),
  ),
  couponsAPI: lazy(() =>
    import("@/features/coupons/api").then((m) => ({ default: m.couponsAPI })),
  ),
  emailTopicsAPI: lazy(() =>
    import("@/features/email-topics/api").then((m) => ({
      default: m.emailTopicsAPI,
    })),
  ),
  tagsAPI: lazy(() =>
    import("@/features/tags/api").then((m) => ({ default: m.tagsAPI })),
  ),
  customFieldsAPI: lazy(() =>
    import("@/features/custom-fields/api").then((m) => ({
      default: m.customFieldsAPI,
    })),
  ),
  flowsAPI: lazy(() =>
    import("@/features/flows/api").then((m) => ({ default: m.flowsAPI })),
  ),
  contactsAPIs: lazy(() =>
    import("@/features/contacts/api").then((m) => ({
      default: m.contactsAPIs,
    })),
  ),
  botFieldAPIs: lazy(() =>
    import("@/features/bot-fields/api").then((m) => ({
      default: m.botFieldAPIs,
    })),
  ),
  integrationActiveCampaignAPI: lazy(() =>
    import("@/features/integration-active-campaign/api").then((m) => ({
      default: m.integrationActiveCampaignAPI,
    })),
  ),
  integrationFacebookAdsAPI: lazy(() =>
    import("@/features/integration-facebook-ads/api").then((m) => ({
      default: m.integrationFacebookAdsAPI,
    })),
  ),
  integrationDripAPI: lazy(() =>
    import("@/features/integration-drip/api").then((m) => ({
      default: m.integrationDripAPI,
    })),
  ),
  integrationGetResponseAPI: lazy(() =>
    import("@/features/integration-get-response/api").then((m) => ({
      default: m.integrationGetResponseAPI,
    })),
  ),
  integrationInstagramAPIs: lazy(() =>
    import("@/features/integration-instagram/api").then((m) => ({
      default: m.integrationInstagramAPIs,
    })),
  ),
  integrationKlaviyoAPI: lazy(() =>
    import("@/features/integration-klaviyo/api").then((m) => ({
      default: m.integrationKlaviyoAPI,
    })),
  ),
  integrationMailchimpAPI: lazy(() =>
    import("@/features/integration-mailchimp/api").then((m) => ({
      default: m.integrationMailchimpAPI,
    })),
  ),
  integrationMailerLiteAPI: lazy(() =>
    import("@/features/integration-mailer-lite/api").then((m) => ({
      default: m.integrationMailerLiteAPI,
    })),
  ),
  integrationMessengerAPIs: lazy(() =>
    import("@/features/integration-messenger/api").then((m) => ({
      default: m.integrationMessengerAPIs,
    })),
  ),
  integrationMoosendAPI: lazy(() =>
    import("@/features/integration-moosend/api").then((m) => ({
      default: m.integrationMoosendAPI,
    })),
  ),
  integrationSmtpAPI: lazy(() =>
    import("@/features/integration-smtp/api").then((m) => ({
      default: m.integrationSmtpAPI,
    })),
  ),
  integrationSendGridAPI: lazy(() =>
    import("@/features/integration-sendgrid/api").then((m) => ({
      default: m.integrationSendGridAPI,
    })),
  ),
  integrationWhatsappAPIs: lazy(() =>
    import("@/features/integration-whatsapp/api").then((m) => ({
      default: m.integrationWhatsappAPIs,
    })),
  ),
  whatsappMessageTemplateAPIs: lazy(() =>
    import("@/features/integration-whatsapp/message-templates/api").then(
      (m) => ({ default: m.whatsappMessageTemplateAPIs }),
    ),
  ),
  whatsappFlowAPIs: lazy(() =>
    import("@/features/integration-whatsapp/flows/api").then((m) => ({
      default: m.whatsappFlowAPIs,
    })),
  ),
  messengerMessageTemplateAPIs: lazy(() =>
    import("@/features/integration-messenger/message-templates/api").then(
      (m) => ({ default: m.messengerMessageTemplateAPIs }),
    ),
  ),
  savedRepliesAPI: lazy(() =>
    import("@/features/saved-replies/api").then((m) => ({
      default: m.savedRepliesAPI,
    })),
  ),
  fbCommentsAPI: lazy(() =>
    import("@/features/fb-comments/api").then((m) => ({
      default: m.fbCommentsAPI,
    })),
  ),
  igCommentsAPI: lazy(() =>
    import("@/features/ig-comments/api").then((m) => ({
      default: m.igCommentsAPI,
    })),
  ),
  igStoriesAPI: lazy(() =>
    import("@/features/ig-stories/api").then((m) => ({
      default: m.igStoriesAPI,
    })),
  ),
  facebookLeadAdsAPI: lazy(() =>
    import("@/features/facebook-lead-ad-automation/api").then((m) => ({
      default: m.facebookLeadAdsAPI,
    })),
  ),
  sequencesAPI: lazy(() =>
    import("@/features/sequences/api").then((m) => ({
      default: m.sequencesAPI,
    })),
  ),
  aiFilesAPI: lazy(() =>
    import("@/features/ai-files/api").then((m) => ({ default: m.aiFilesAPI })),
  ),
  inboxesAPI: lazy(() =>
    import("@/features/inboxes/api").then((m) => ({ default: m.inboxesAPI })),
  ),
  spreadsheetsAPI: lazy(() =>
    import("@/features/spreadsheets/api").then((m) => ({
      default: m.spreadsheetsAPI,
    })),
  ),
  workspaceMembersAPI: lazy(() =>
    import("@/features/workspace-members/api").then((m) => ({
      default: m.workspaceMembersAPI,
    })),
  ),
  inboxTeamsAPI: lazy(() =>
    import("@/enterprise/features/inbox-teams/api").then((m) => ({
      default: m.inboxTeamsAPI,
    })),
  ),
  foldersAPI: lazy(() =>
    import("@/features/folders/api").then((m) => ({ default: m.foldersAPI })),
  ),
  messagesAPI: lazy(() =>
    import("@/features/messages/api").then((m) => ({ default: m.messagesAPI })),
  ),
  personasAPIs: lazy(() =>
    import("@/features/personas/api").then((m) => ({
      default: m.personasAPIs,
    })),
  ),
  errorLogsAPI: lazy(() =>
    import("@/features/error-logs/api").then((m) => ({
      default: m.errorLogsAPI,
    })),
  ),
  externalWebhooksAPI: lazy(() =>
    import("@/features/external-webhooks/api").then((m) => ({
      default: m.externalWebhooksAPI,
    })),
  ),
  workspacesAPI: lazy(() =>
    import("@/features/workspaces/api").then((m) => ({
      default: m.workspacesAPI,
    })),
  ),
  aiFunctionsAPI: lazy(() =>
    import("@/features/ai-functions/api").then((m) => ({
      default: m.aiFunctionsAPI,
    })),
  ),
  platformCredentialsAPI: lazy(() =>
    import("@/features/platform-credentials/api").then((m) => ({
      default: m.platformCredentialsAPI,
    })),
  ),
  productsAPI: lazy(() =>
    import("@/features/products/api").then((m) => ({ default: m.productsAPI })),
  ),
  productCategoriesAPI: lazy(() =>
    import("@/features/product-categories/api").then((m) => ({
      default: m.productCategoriesAPI,
    })),
  ),
  questionnairesAPI: lazy(() =>
    import("@/features/questionnaires/api").then((m) => ({
      default: m.questionnairesAPI,
    })),
  ),
  refLinksAPI: lazy(() =>
    import("@/features/reflinks/api").then((m) => ({ default: m.refLinksAPI })),
  ),
  keywordsAPI: lazy(() =>
    import("@/features/automated-response/api").then((m) => ({
      default: m.keywordsAPI,
    })),
  ),
  integrationsAPI: lazy(() =>
    import("@/features/integrations/api").then((m) => ({
      default: m.integrationsAPI,
    })),
  ),
  triggersAPI: lazy(() =>
    import("@/features/triggers/api").then((m) => ({ default: m.triggersAPI })),
  ),
  userPersistentMenusAPI: lazy(() =>
    import("@/features/user-persistent-menus/api").then((m) => ({
      default: m.userPersistentMenusAPI,
    })),
  ),
  webhooksAPI: lazy(() =>
    import("@/features/webhooks/api").then((m) => ({ default: m.webhooksAPI })),
  ),
  analyticsRoutes: authorizedAPI
    // @ts-expect-error
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .router(analyticsRoutes),
}
