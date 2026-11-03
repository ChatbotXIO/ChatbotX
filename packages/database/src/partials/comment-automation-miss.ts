import { z } from "zod"

/**
 * Why an automation declined to answer a comment it was shown.
 *
 * One value per `continue` in `processCommentAutomation`'s filter chain, in the
 * order the loop evaluates them. This is the whole vocabulary of the Misses
 * column: a comment that passed every gate and then failed to send is NOT a
 * miss — it is an attempt, and it earns a `failed` `CommentAutomationEvent`
 * row instead (see that partial's docblock for the filtered-out vs.
 * blocked-delivery line).
 *
 * Adding a filter to the loop means adding a value here AND recording it next
 * to the filter's `logAutomationSkipped` call, or the new filter silently
 * swallows comments the Misses column never accounts for.
 */
export const commentAutomationMissReasons = z.enum([
  /** Outside the automation's start/end window, in the workspace timezone. */
  "outsideSchedule",
  /** The comment's post is not in the automation's `post` targeting. */
  "postNotMatched",
  /** A reply to another comment, with `ignoreCommentReplies` on. */
  "commentIsReply",
  /** `includeKeywords` did not match, or `excludeKeywords` did. */
  "keywordsNotMatched",
  /** "Reply to" is `mentions` and the comment tagged a different number. */
  "mentionCountNotMatched",
  /** `onlyCommentsWithImage` on and the comment carries no photo. */
  "noImageAttachment",
  /** `replyToNewContactsOnly` on and the contact already had other inboxes. */
  "contactNotNew",
  /** `replyOncePerUserPerPost` on and this user was already answered here. */
  "alreadyRepliedOnPost",
  /** `replyToUsersWhoCommentedOnOtherPosts` off and they engaged elsewhere. */
  "engagedOnOtherPost",
  /**
   * A hide rule or AI moderation hid/deleted the comment, so it is not
   * answered. Evaluated BEFORE the reply filters above, despite sitting last
   * here — Postgres enum values can only be appended.
   */
  "moderated",
])

export type CommentAutomationMissReason = z.infer<
  typeof commentAutomationMissReasons
>
