import type { CommentPost } from "@chatbotx.io/database/partials"

/**
 * Narrows a stored post target to what Threads and TikTok support: specific
 * posts, hashtags, or everything. The shared table can hold Meta-only types
 * (`published`, `ads`, `reels`, `live`), which these channels treat as `all`.
 */
export function toChannelPostTarget(post: CommentPost): {
  type: "all" | "postIds" | "hashtags"
  value: string[]
} {
  if (post.type === "postIds" || post.type === "hashtags") {
    return { type: post.type, value: post.value }
  }
  return { type: "all", value: [] }
}
