import type { TemplateResourceCategory } from "@chatbotx.io/database/partials"
import type { TOOLS_CONFIG } from "./tools-list"

type ToolId = (typeof TOOLS_CONFIG)[number]["id"]

/**
 * What a template does with one Tools card. Every card must declare it, so a
 * new tool cannot ship without someone deciding whether its configuration
 * travels in a template (see the `template-integration` skill).
 */
type ToolTemplateCoverage =
  | {
      /** The template categories that carry this tool's configuration. */
      categories: readonly TemplateResourceCategory[]
    }
  | {
      /** Why nothing of this tool travels: no transferable configuration, or bound to an external account. */
      excluded: string
    }

export const TOOL_TEMPLATE_COVERAGE = {
  "facebook-comment": { categories: ["fbCommentAutomations"] },
  "instagram-comment": { categories: ["fbCommentAutomations"] },
  "threads-comment": { categories: ["fbCommentAutomations"] },
  "tiktok-comment": { categories: ["fbCommentAutomations"] },
  "instagram-story": { categories: ["storyAutomations"] },
  "facebook-lead-ads": {
    excluded:
      "An all-forms automation has no configuration besides its name and page; a specific-form field mapping is the question list of one Meta form on the source page.",
  },
  "facebook-marketing-messages": {
    excluded: "Bound to a Meta ad account and campaign.",
  },
  "click-to-message-ads": {
    excluded: "Bound to a Meta ad account and campaign.",
  },
  reflinks: { categories: ["entryPointLinks"] },
  "qr-code": { categories: ["entryPointLinks"] },
  "magic-links": { categories: ["magicLinks"] },
  "dynamic-image": { categories: ["dynamicImages"] },
  templates: { excluded: "This is the templates feature itself." },
  appointment: { categories: ["calendars"] },
  questionnaires: { categories: ["questionnaires"] },
  ecommerce: {
    categories: [
      "products",
      "openHours",
      "vendors",
      "discountCodes",
      "storeSettings",
    ],
  },
  coupons: { categories: ["couponTopics"] },
  minigames: { categories: ["minigames"] },
  leaderboards: { categories: ["leaderboards"] },
  "mini-apps": { categories: ["miniApps"] },
  "bot-simulator": { excluded: "Stores no data: nothing to copy." },
  "decision-profiles": {
    excluded:
      "A profile needs an AI Router connection, which holds an encrypted credential.",
  },
  "inbound-webhooks": { categories: ["inboundWebhooks"] },
  "places-near-me": { categories: ["placeLocations"] },
  "poll-manager": { categories: ["polls"] },
} as const satisfies Record<ToolId, ToolTemplateCoverage>
