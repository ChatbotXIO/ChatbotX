import { z } from "zod"

/** Whether a comment was moderated by a hide rule or by the AI. */
export const commentModerationSources = z.enum(["rule", "ai"])
export type CommentModerationSource = z.infer<typeof commentModerationSources>

/**
 * The hide rule that matched, one per `hideComments` switch. Null on an
 * `ai` row. The first matching rule wins, in the order `applyHideComments`
 * evaluates them.
 */
export const commentModerationRules = z.enum([
  "all",
  "phoneNumber",
  "link",
  "keyword",
  "image",
  "video",
  "gif",
  "emoji",
])
export type CommentModerationRule = z.infer<typeof commentModerationRules>

/**
 * `pending` from the moment the row is written until the channel job settles
 * it — a row stuck there means the hide/delete job never ran.
 */
export const commentModerationStatuses = z.enum(["pending", "done", "failed"])
export type CommentModerationStatus = z.infer<typeof commentModerationStatuses>
