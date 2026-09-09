import { z } from "zod"

/**
 * Which side of the comment the automation answered on: a public reply under
 * the comment itself, or a private DM anchored to it. One automation can do
 * both for the same comment, so this is part of the event's natural key.
 */
export const commentAutomationReplyChannels = z.enum(["public", "private"])
export type CommentAutomationReplyChannel = z.infer<
  typeof commentAutomationReplyChannels
>

/**
 * `sent` means the reply reached the channel (or was enqueued for an async
 * flow/AI job); `failed` means the dispatch threw or the async job gave up.
 * Filtered-out comments are deliberately NOT events — skips stay in the logs,
 * so these tables only ever count work the automation actually attempted.
 */
export const commentAutomationEventStatuses = z.enum(["sent", "failed"])
export type CommentAutomationEventStatus = z.infer<
  typeof commentAutomationEventStatuses
>
