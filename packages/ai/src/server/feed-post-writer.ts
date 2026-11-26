/**
 * Writes a feed item's post with AI, on its own package subpath
 * (`@chatbotx.io/ai/feed-post-writer`). The worker and the builder's Node
 * route handlers register `writeFeedPost` with `registerFeedPostWriter`
 * (AGENTS.md invariant 25 keeps it out of the Edge-traced router graph).
 */
export { isFeedAiModelUsable, writeFeedPost } from "./services/feed-post-writer"
