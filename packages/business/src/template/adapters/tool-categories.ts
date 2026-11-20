import type { TemplateResourceCategory } from "@chatbotx.io/database/partials"

/**
 * The tool categories, installed right after the coupon topics (see
 * `TEMPLATE_INSTALL_ORDER`) and before the early entries, so every text that
 * can link to a tool finds the copy it must point at. Kept apart from the
 * registry so the install engine can read it without importing every adapter.
 */
export const TEMPLATE_TOOL_CATEGORIES = [
  "polls",
  "placeLocations",
  "magicLinks",
  "dynamicImages",
  "miniApps",
  "minigames",
  // After the minigame it can be scored from, and the inbox it runs on.
  "leaderboards",
] as const satisfies readonly TemplateResourceCategory[]
