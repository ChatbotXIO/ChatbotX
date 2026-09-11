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
 * flow/AI job); `failed` means the dispatch threw, the async job gave up, or
 * the reply was blocked before it could be dispatched at all.
 *
 * These tables only ever count work the automation actually attempted, and the
 * line runs between two things that both look like "a skip" in the logs:
 *
 * - **Filtered out** — the comment never qualified (outside schedule, wrong
 *   post, keywords, already replied, contact not new, outside business hours,
 *   nothing for the agent to answer). Deliberately NOT an event: the automation
 *   chose not to act, and a row per non-matching comment would bury the ones
 *   that matter.
 * - **Blocked delivery** — the comment qualified and the automation tried, but
 *   the reply could not go out: Meta's 7-day private-reply window had closed, or
 *   another automation had already spent the comment's single DM. That IS an
 *   attempt, so it is a `failed` row whose `errorDetail` says why — otherwise
 *   the workspace cannot tell it apart from "the automation never matched".
 */
export const commentAutomationEventStatuses = z.enum(["sent", "failed"])
export type CommentAutomationEventStatus = z.infer<
  typeof commentAutomationEventStatuses
>
