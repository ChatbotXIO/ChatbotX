import {
  COMMENT_MODERATION_DEFAULT_DECISION_THRESHOLD,
  type CommentAIModeration,
} from "@chatbotx.io/database/partials"

/**
 * What the AI moderation block starts from: off, hiding (reversible) the three
 * categories nobody wants on their posts. `negative` and `spam` are opt-in —
 * they are where an honest complaint or a customer's link is most likely to be
 * caught by mistake.
 */
export const AI_MODERATION_DEFAULTS: CommentAIModeration = {
  enabled: false,
  engine: "aiAgent",
  aiAgentId: null,
  decisionConnectionId: null,
  decisionModel: null,
  decisionThreshold: COMMENT_MODERATION_DEFAULT_DECISION_THRESHOLD,
  categories: ["hate", "offensive", "harassment"],
  instruction: "",
  action: "hide",
}

/**
 * The stored settings, or the defaults for a row written before they existed.
 * A row stored before engines existed is filled in as the AI agent engine.
 */
export function withAIModerationDefaults(
  aiModeration: CommentAIModeration | undefined,
): CommentAIModeration {
  if (!aiModeration) {
    return AI_MODERATION_DEFAULTS
  }
  return {
    ...AI_MODERATION_DEFAULTS,
    ...aiModeration,
    engine: aiModeration.engine ?? "aiAgent",
    decisionThreshold:
      aiModeration.decisionThreshold ??
      COMMENT_MODERATION_DEFAULT_DECISION_THRESHOLD,
  }
}
