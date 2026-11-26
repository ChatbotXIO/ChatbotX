import { z } from "zod"

/**
 * Who owns the Channel and "All pages and accounts" filters of the post
 * analytics view: `own` (Posts > Analytics, which renders them itself) or
 * `shared` (the Analytics dashboard, whose shared row drives the same `channels`
 * and `inboxIds` URL params).
 */
export const postAnalyticsScopeFilters = z.enum(["own", "shared"])

export type PostAnalyticsScopeFilters = z.infer<
  typeof postAnalyticsScopeFilters
>
