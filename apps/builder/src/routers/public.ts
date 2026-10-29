import { lazy } from "@orpc/server"

// Every feature branch is a lazy router: the feature's public api module (and
// its import graph) only loads on the first request that targets it, instead of
// all ~90 modules compiling with the `/api/[[...rest]]` route handler. The spec
// served by `/api/public-spec.json` is generated ahead of time (see
// `pnpm --filter builder gen:public-spec`), so it does not import this file.
//
// `prefix` is REQUIRED for the laziness to hold. oRPC's OpenAPIMatcher unlazies
// a branch when `!prefix || pathname.startsWith(prefix) || pathname.startsWith(key path)`;
// the key path (`/tags`) never matches a real route (`/v1/tags/...`), so a branch
// without `prefix` is loaded on the very first request. A WRONG prefix makes the
// branch unreachable (silent 404) — __tests__/public-router-lazy-prefix.test.ts
// checks every procedure's `route.path` against its branch prefix.
//
// Branches whose procedures span several unrelated `/v1/*` roots have no useful
// prefix; they are listed in `UNPREFIXED_PUBLIC_BRANCHES` in that test.
// dynamic import() is allowed in apps/builder — see .agents/rules/no-dynamic-import.md.
export const publicRouter = {
  ads: lazy(
    () =>
      import("@/features/ads/api/public").then((m) => ({
        default: m.adsPublicRouter,
      })),
    { prefix: "/v1/ads" },
  ),
  aiAgents: lazy(
    () =>
      import("@/features/ai-agents/api/public").then((m) => ({
        default: m.aiAgentsPublicRouter,
      })),
    { prefix: "/v1/ai-agents" },
  ),
  aiFiles: lazy(
    () =>
      import("@/features/ai-files/api/public").then((m) => ({
        default: m.aiFilesPublicRouter,
      })),
    { prefix: "/v1/ai-files" },
  ),
  aiHandover: lazy(
    () =>
      import("@/features/integration-ai-handover/api/public").then((m) => ({
        default: m.aiHandoverPublicRouter,
      })),
    { prefix: "/v1/inboxes" },
  ),
  aiFunctions: lazy(
    () =>
      import("@/features/ai-functions/api/public").then((m) => ({
        default: m.aiFunctionsPublicRouter,
      })),
    { prefix: "/v1/ai-functions" },
  ),
  aiMcpServers: lazy(
    () =>
      import("@/features/ai-mcp-servers/api/public").then((m) => ({
        default: m.aiMcpServersPublicRouter,
      })),
    { prefix: "/v1/ai-mcp-servers" },
  ),
  analytics: lazy(
    () =>
      import("@/features/analytics/api/public").then((m) => ({
        default: m.analyticsPublicRouter,
      })),
    { prefix: "/v1/analytics" },
  ),
  appointmentCalendars: lazy(
    () =>
      import("@/features/appointment-calendars/api/public").then((m) => ({
        default: m.appointmentCalendarsPublicRouter,
      })),
    { prefix: "/v1/appointment-calendars" },
  ),
  appointmentExternalCalendars: lazy(
    () =>
      import("@/features/external-calendars/api/public").then((m) => ({
        default: m.appointmentExternalCalendarsPublicRouter,
      })),
    { prefix: "/v1/appointment-external-calendars" },
  ),
  appointmentReminders: lazy(
    () =>
      import("@/features/appointment-management/api/public").then((m) => ({
        default: m.appointmentRemindersPublicRouter,
      })),
    { prefix: "/v1/appointment-reminders" },
  ),
  appointments: lazy(
    () =>
      import("@/features/appointments/api/public").then((m) => ({
        default: m.appointmentsPublicRouter,
      })),
    { prefix: "/v1/appointments" },
  ),
  botFields: lazy(
    () =>
      import("@/features/bot-fields/api/public").then((m) => ({
        default: m.botFieldsPublicRouter,
      })),
    { prefix: "/v1/bot-fields" },
  ),
  botSimulator: lazy(
    () =>
      import("@/features/bot-simulator/api/public").then((m) => ({
        default: m.botSimulatorPublicRouter,
      })),
    { prefix: "/v1/bot-simulator/link" },
  ),
  broadcasts: lazy(
    () =>
      import("@/features/broadcasts/api/public").then((m) => ({
        default: m.broadcastsPublicRouter,
      })),
    { prefix: "/v1/broadcasts" },
  ),
  capabilities: lazy(
    () =>
      import("@/features/capabilities/api/public").then((m) => ({
        default: m.capabilitiesPublicRouter,
      })),
    { prefix: "/v1/capabilities" },
  ),
  channelPosts: lazy(
    () =>
      import("@/features/channel-posts/api/public").then((m) => ({
        default: m.channelPostsPublicRouter,
      })),
    { prefix: "/v1/channel-posts" },
  ),
  carts: lazy(
    () =>
      import("@/features/webshop/api/public").then((m) => ({
        default: m.cartsPublicRouter,
      })),
    { prefix: "/v1/carts" },
  ),
  channels: lazy(
    () =>
      import("@/features/integration-api/api/public").then((m) => ({
        default: m.channelsPublicRouter,
      })),
    { prefix: "/v1/channels/api" },
  ),
  commentAutomations: lazy(
    () =>
      import("@/features/shared/comment-automation/api/public").then((m) => ({
        default: m.commentAutomationsPublicRouter,
      })),
    { prefix: "/v1/comment-automations" },
  ),
  connectionProviders: lazy(
    () =>
      import("@/features/connections/api/public").then((m) => ({
        default: m.connectionProvidersPublicRouter,
      })),
    { prefix: "/v1/connection-providers" },
  ),
  connections: lazy(
    () =>
      import("@/features/connections/api/public").then((m) => ({
        default: m.connectionsPublicRouter,
      })),
    { prefix: "/v1/connections" },
  ),
  connectSessions: lazy(
    () =>
      import("@/features/connections/api/public").then((m) => ({
        default: m.connectSessionsPublicRouter,
      })),
    { prefix: "/v1/connect-sessions" },
  ),
  contactScans: lazy(
    () =>
      import("@/features/contact-scan/api/public").then((m) => ({
        default: m.contactScanPublicRouter,
      })),
    { prefix: "/v1/contact-scans" },
  ),
  contacts: lazy(
    () =>
      import("@/features/contacts/api/public").then((m) => ({
        default: m.contactsPublicRouter,
      })),
    { prefix: "/v1/contacts" },
  ),
  conversations: lazy(
    () =>
      import("@/features/conversations/api/public").then((m) => ({
        default: m.conversationsPublicRouter,
      })),
    { prefix: "/v1/conversations" },
  ),
  coupons: lazy(() =>
    import("@/features/coupons/api/public").then((m) => ({
      default: m.couponsPublicRouter,
    })),
  ),
  customFields: lazy(
    () =>
      import("@/features/custom-fields/api/public").then((m) => ({
        default: m.customFieldsPublicRouter,
      })),
    { prefix: "/v1/custom-fields" },
  ),
  decisionConnections: lazy(
    () =>
      import("@/features/decision-connections/api/public").then((m) => ({
        default: m.decisionConnectionsPublicRouter,
      })),
    { prefix: "/v1/decision-connections" },
  ),
  decisionProfiles: lazy(
    () =>
      import("@/features/decision-profiles/api/public").then((m) => ({
        default: m.decisionProfilesPublicRouter,
      })),
    { prefix: "/v1/decision-profiles" },
  ),
  discountCodes: lazy(
    () =>
      import("@/features/discount-codes/api/public").then((m) => ({
        default: m.discountCodesPublicRouter,
      })),
    { prefix: "/v1/discount-codes" },
  ),
  dynamicImages: lazy(
    () =>
      import("@/features/dynamic-images/api/public").then((m) => ({
        default: m.dynamicImagesPublicRouter,
      })),
    { prefix: "/v1/dynamic-images" },
  ),
  ecommerceAnalytics: lazy(
    () =>
      import("@/features/ecommerce-analytics/api/public").then((m) => ({
        default: m.ecommerceAnalyticsPublicRouter,
      })),
    { prefix: "/v1/ecommerce/analytics" },
  ),
  ecommerceSettings: lazy(
    () =>
      import("@/features/ecommerce-settings/api/public").then((m) => ({
        default: m.ecommerceSettingsPublicRouter,
      })),
    { prefix: "/v1/ecommerce/settings" },
  ),
  emailTopics: lazy(
    () =>
      import("@/features/email-topics/api/public").then((m) => ({
        default: m.emailTopicsPublicRouter,
      })),
    { prefix: "/v1/email-topics" },
  ),
  errorLogs: lazy(
    () =>
      import("@/features/error-logs/api/public").then((m) => ({
        default: m.errorLogsPublicRouter,
      })),
    { prefix: "/v1/error-logs" },
  ),
  externalWebhooks: lazy(
    () =>
      import("@/features/external-webhooks/api/public").then((m) => ({
        default: m.externalWebhooksPublicRouter,
      })),
    { prefix: "/v1/external-webhooks" },
  ),
  facebookLeadAds: lazy(
    () =>
      import("@/features/facebook-lead-ad-automation/api/public").then((m) => ({
        default: m.facebookLeadAdsPublicRouter,
      })),
    { prefix: "/v1/facebook-lead-ads" },
  ),
  facebookMarketingMessages: lazy(
    () =>
      import("@/features/facebook-marketing-messages/api/public").then((m) => ({
        default: m.facebookMarketingMessagesPublicRouter,
      })),
    { prefix: "/v1/marketing-messages" },
  ),
  fbComments: lazy(
    () =>
      import("@/features/fb-comments/api/public").then((m) => ({
        default: m.fbCommentsPublicRouter,
      })),
    { prefix: "/v1/fb-comments" },
  ),
  flows: lazy(
    () =>
      import("@/features/flows/api/public").then((m) => ({
        default: m.flowsPublicRouter,
      })),
    { prefix: "/v1/flows" },
  ),
  folders: lazy(
    () =>
      import("@/features/folders/api/public").then((m) => ({
        default: m.foldersPublicRouter,
      })),
    { prefix: "/v1/folders" },
  ),
  googleAds: lazy(
    () =>
      import("@/features/integration-google-ads/api/public").then((m) => ({
        default: m.googleAdsPublicRouter,
      })),
    { prefix: "/v1/google-ads" },
  ),
  igComments: lazy(
    () =>
      import("@/features/ig-comments/api/public").then((m) => ({
        default: m.igCommentsPublicRouter,
      })),
    { prefix: "/v1/ig-comments" },
  ),
  igStories: lazy(
    () =>
      import("@/features/ig-stories/api/public").then((m) => ({
        default: m.igStoriesPublicRouter,
      })),
    { prefix: "/v1/ig-stories" },
  ),
  channelIntegrations: lazy(
    () =>
      import("@/features/channel-integrations/api/public").then((m) => ({
        default: m.channelIntegrationsPublicRouter,
      })),
    { prefix: "/v1/channel-integrations" },
  ),
  instagramChannels: lazy(
    () =>
      Promise.all([
        import("@/features/channel-integrations/api/public"),
        import("@/features/integration-instagram/api/public"),
      ]).then(([a, b]) => ({
        default: {
          ...a.createChannelReadRoutes("instagram"),
          ...a.createCoexistRoute("instagram"),
          ...a.createCapiRoutes("instagram"),
          ...b.instagramChannelsPublicRouter,
        },
      })),
    { prefix: "/v1/instagram-channels" },
  ),
  inboundWebhookChannels: lazy(
    () =>
      import("@/features/inbound-webhooks/api/public").then((m) => ({
        default: m.inboundWebhookChannelsPublicRouter,
      })),
    { prefix: "/v1/inbound-webhook-channels" },
  ),
  inboundWebhooks: lazy(
    () =>
      import("@/features/inbound-webhooks/api/public").then((m) => ({
        default: m.inboundWebhooksPublicRouter,
      })),
    { prefix: "/v1/inbound-webhooks" },
  ),
  inboxTeams: lazy(
    () =>
      import("@/enterprise/features/inbox-teams/api/public").then((m) => ({
        default: m.inboxTeamsPublicRouter,
      })),
    { prefix: "/v1/teams" },
  ),
  inboxes: lazy(() =>
    import("@/features/inboxes/api/public").then((m) => ({
      default: m.inboxesPublicRouter,
    })),
  ),
  integrations: lazy(
    () =>
      import("@/features/integrations/api/public").then((m) => ({
        default: m.integrationsPublicRouter,
      })),
    { prefix: "/v1/integrations" },
  ),
  keywords: lazy(
    () =>
      import("@/features/automated-response/api/public").then((m) => ({
        default: m.keywordsPublicRouter,
      })),
    { prefix: "/v1/keywords" },
  ),
  magicLinks: lazy(
    () =>
      import("@/features/magic-links/api/public").then((m) => ({
        default: m.magicLinksPublicRouter,
      })),
    { prefix: "/v1/magic-links" },
  ),
  mediaLibrary: lazy(
    () =>
      import("@/features/media-library/api/public").then((m) => ({
        default: m.mediaLibraryPublicRouter,
      })),
    { prefix: "/v1/media-library" },
  ),
  messages: lazy(
    () =>
      import("@/features/messages/api/public").then((m) => ({
        default: m.messagesPublicRouter,
      })),
    { prefix: "/v1/conversations" },
  ),
  messengerChannels: lazy(
    () =>
      import("@/features/integration-messenger/api/public").then((m) => ({
        default: m.messengerChannelsPublicRouter,
      })),
    { prefix: "/v1/messenger-channels" },
  ),
  messengerPersonas: lazy(
    () =>
      import("@/features/personas/api/public").then((m) => ({
        default: m.messengerPersonasPublicRouter,
      })),
    { prefix: "/v1/messenger-personas" },
  ),
  messengerTemplates: lazy(() =>
    import(
      "@/features/integration-messenger/message-templates/api/public"
    ).then((m) => ({ default: m.messengerTemplatesPublicRouter })),
  ),
  miniApps: lazy(
    () =>
      import("@/features/mini-apps/api/public").then((m) => ({
        default: m.miniAppsPublicRouter,
      })),
    { prefix: "/v1/mini-apps" },
  ),
  minigames: lazy(
    () =>
      import("@/features/minigames/api/public").then((m) => ({
        default: m.minigamesPublicRouter,
      })),
    { prefix: "/v1/minigames" },
  ),
  leaderboards: lazy(
    () =>
      import("@/features/leaderboards/api/public").then((m) => ({
        default: m.leaderboardsPublicRouter,
      })),
    { prefix: "/v1/leaderboards" },
  ),
  pipelines: lazy(() =>
    import("@/features/pipelines/api/public").then((m) => ({
      default: m.pipelinesPublicRouter,
    })),
  ),
  openHours: lazy(
    () =>
      import("@/features/ecommerce-open-hours/api/public").then((m) => ({
        default: m.openHoursPublicRouter,
      })),
    { prefix: "/v1/open-hours" },
  ),
  orders: lazy(
    () =>
      import("@/features/orders/api/public").then((m) => ({
        default: m.ordersPublicRouter,
      })),
    { prefix: "/v1/orders" },
  ),
  paymentProviders: lazy(
    () =>
      import("@/features/payment-providers/api/public").then((m) => ({
        default: m.paymentProvidersPublicRouter,
      })),
    { prefix: "/v1/payment-providers" },
  ),
  productCategories: lazy(
    () =>
      import("@/features/product-categories/api/public").then((m) => ({
        default: m.productCategoriesPublicRouter,
      })),
    { prefix: "/v1/product-categories" },
  ),
  products: lazy(
    () =>
      import("@/features/products/api/public").then((m) => ({
        default: m.productsPublicRouter,
      })),
    { prefix: "/v1/products" },
  ),
  productVendors: lazy(
    () =>
      import("@/features/product-vendors/api/public").then((m) => ({
        default: m.productVendorsPublicRouter,
      })),
    { prefix: "/v1/product-vendors" },
  ),
  qrCodes: lazy(
    () =>
      import("@/features/qr-codes/api/public").then((m) => ({
        default: m.qrCodesPublicRouter,
      })),
    { prefix: "/v1/qr-codes" },
  ),
  questionnaires: lazy(
    () =>
      import("@/features/questionnaires/api/public").then((m) => ({
        default: m.questionnairesPublicRouter,
      })),
    { prefix: "/v1/questionnaires" },
  ),
  reflinks: lazy(
    () =>
      import("@/features/reflinks/api/public").then((m) => ({
        default: m.reflinksPublicRouter,
      })),
    { prefix: "/v1/ref-links" },
  ),
  savedReplies: lazy(
    () =>
      import("@/features/saved-replies/api/public").then((m) => ({
        default: m.savedRepliesPublicRouter,
      })),
    { prefix: "/v1/saved-replies" },
  ),
  schemas: lazy(
    () =>
      import("@/features/capabilities/api/public").then((m) => ({
        default: m.schemasPublicRouter,
      })),
    { prefix: "/v1/schemas/flow-spec" },
  ),
  sequences: lazy(() =>
    import("@/features/sequences/api/public").then((m) => ({
      default: m.sequencesPublicRouter,
    })),
  ),
  smtpIntegrations: lazy(
    () =>
      import("@/features/integration-smtp/api/public").then((m) => ({
        default: m.smtpIntegrationsPublicRouter,
      })),
    { prefix: "/v1/smtp-integrations" },
  ),
  spreadsheets: lazy(
    () =>
      import("@/features/spreadsheets/api/public").then((m) => ({
        default: m.spreadsheetsPublicRouter,
      })),
    { prefix: "/v1/spreadsheets" },
  ),
  tags: lazy(
    () =>
      import("@/features/tags/api/public").then((m) => ({
        default: m.tagsPublicRouter,
      })),
    { prefix: "/v1/tags" },
  ),
  templateMessages: lazy(
    () =>
      import(
        "@/features/integration-whatsapp/message-templates/api/public"
      ).then((m) => ({ default: m.templateMessagesPublicRouter })),
    { prefix: "/v1/template-messages" },
  ),
  threadsComments: lazy(
    () =>
      import("@/features/threads-comments/api/public").then((m) => ({
        default: m.threadsCommentsPublicRouter,
      })),
    { prefix: "/v1/threads-comments" },
  ),
  tiktokComments: lazy(
    () =>
      import("@/features/tiktok-comments/api/public").then((m) => ({
        default: m.tiktokCommentsPublicRouter,
      })),
    { prefix: "/v1/tiktok-comments" },
  ),
  token: lazy(
    () =>
      import("@/features/token/api/public").then((m) => ({
        default: m.tokenPublicRouter,
      })),
    { prefix: "/v1/token" },
  ),
  tiktokChannels: lazy(
    () =>
      Promise.all([
        import("@/features/channel-integrations/api/public"),
        import("@/features/integration-tiktok/api/public"),
      ]).then(([a, b]) => ({
        default: {
          ...a.createChannelReadRoutes("tiktok"),
          ...b.tiktokChannelsPublicRouter,
        },
      })),
    { prefix: "/v1/tiktok-channels" },
  ),
  triggers: lazy(
    () =>
      import("@/features/triggers/api/public").then((m) => ({
        default: m.triggersPublicRouter,
      })),
    { prefix: "/v1/triggers" },
  ),
  userPersistentMenus: lazy(
    () =>
      import("@/features/user-persistent-menus/api/public").then((m) => ({
        default: m.userPersistentMenusPublicRouter,
      })),
    { prefix: "/v1/user-persistent-menus" },
  ),
  webchats: lazy(
    () =>
      import("@/features/integration-webchat/api/public").then((m) => ({
        default: m.webchatsPublicRouter,
      })),
    { prefix: "/v1/webchats" },
  ),
  webshop: lazy(
    () =>
      import("@/features/webshop/api/public").then((m) => ({
        default: m.webshopPublicRouter,
      })),
    { prefix: "/v1/webshop/link" },
  ),
  webhooks: lazy(
    () =>
      import("@/features/webhooks/api/public").then((m) => ({
        default: m.webhooksPublicRouter,
      })),
    { prefix: "/v1/webhooks" },
  ),
  whatsappCalls: lazy(
    () =>
      import("@/features/whatsapp-calls/api/public").then((m) => ({
        default: m.whatsappCallsPublicRouter,
      })),
    { prefix: "/v1/whatsapp/calls" },
  ),
  whatsappFlows: lazy(() =>
    import("@/features/integration-whatsapp/flows/api/public").then((m) => ({
      default: m.whatsappFlowsPublicRouter,
    })),
  ),
  whatsappChannels: lazy(
    () =>
      Promise.all([
        import("@/features/channel-integrations/api/public"),
        import("@/features/integration-whatsapp/calling/api/public"),
      ]).then(([a, b]) => ({
        default: {
          ...a.createChannelReadRoutes("whatsapp"),
          ...a.createHandoverResumeFlowRoute("whatsapp"),
          ...a.createCoexistRoute("whatsapp"),
          ...a.createCapiRoutes("whatsapp"),
          ...b.whatsappCallingPublicRouter,
        },
      })),
    { prefix: "/v1/whatsapp-channels" },
  ),
  whatsappTemplates: lazy(() =>
    import("@/features/integration-whatsapp/message-templates/api/public").then(
      (m) => ({ default: m.whatsappTemplatesPublicRouter }),
    ),
  ),
  responseSla: lazy(
    () =>
      import("@/features/response-sla/api/public").then((m) => ({
        default: m.responseSlaPublicRouter,
      })),
    { prefix: "/v1/response-sla" },
  ),
  workingHours: lazy(() =>
    import("@/features/working-hours/api/public").then((m) => ({
      default: m.workingHoursPublicRouter,
    })),
  ),
  workspaceMembers: lazy(
    () =>
      import("@/features/workspace-members/api/public").then((m) => ({
        default: m.workspaceMembersPublicRouter,
      })),
    { prefix: "/v1/members" },
  ),
  workspaceSettings: lazy(
    () =>
      import("@/features/workspaces/api/public").then((m) => ({
        default: m.workspaceSettingsPublicRouter,
      })),
    { prefix: "/v1/workspace/settings" },
  ),
  zaloChannels: lazy(
    () =>
      import("@/features/integration-zalo/api/public").then((m) => ({
        default: m.zaloChannelsPublicRouter,
      })),
    { prefix: "/v1/zalo-channels" },
  ),
}
