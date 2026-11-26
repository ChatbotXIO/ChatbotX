import { orpc } from "@/lib/orpc/query"

/**
 * The reads a change to a post alters: the list (which the calendar pages
 * through as well) and the per-state counts shown on the list's filters. Every
 * create, update, delete, publish, reschedule and realtime change invalidates
 * all of them together.
 */
export const socialPostListQueryKeys = () => [
  orpc.socialPostsAPIs.privateListSocialPostsAPI.key(),
  orpc.socialPostsAPIs.privateCountSocialPostsAPI.key(),
]
