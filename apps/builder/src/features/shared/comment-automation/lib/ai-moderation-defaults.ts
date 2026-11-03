import type { CommentAIModeration } from "@chatbotx.io/database/partials"

/**
 * What the AI moderation block starts from: off, hiding (reversible) the three
 * categories nobody wants on their posts. `negative` and `spam` are opt-in —
 * they are where an honest complaint or a customer's link is most likely to be
 * caught by mistake.
 */
export const AI_MODERATION_DEFAULTS: CommentAIModeration = {
  enabled: false,
  aiAgentId: null,
  categories: ["hate", "offensive", "harassment"],
  instruction: "",
  action: "hide",
}

/** The stored settings, or the defaults for a row written before they existed. */
export function withAIModerationDefaults(
  aiModeration: CommentAIModeration | undefined,
): CommentAIModeration {
  return aiModeration ?? AI_MODERATION_DEFAULTS
}
