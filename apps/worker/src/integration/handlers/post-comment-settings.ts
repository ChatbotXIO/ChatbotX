import {
  type ChannelPostCommentSettings,
  channelPostService,
  chargeCommentActionOnce,
  conversationService,
  messageUsageService,
} from "@chatbotx.io/business"
import { liveCommentCapabilities } from "@chatbotx.io/database/partials"
import type {
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import { casStore } from "@chatbotx.io/redis"
import { hasPhoneNumber } from "@chatbotx.io/utils/has-phone-number"
import { ChatJobAction, chatQueue } from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"
import type { CommentAutomationChannelType } from "./comment-automation/channel-type"
import { supportsHideForComment } from "./comment-automation/hide-comments"
import { withReplayPriority } from "./comment-automation/replay-priority"

type PostCommentSettingsInput = {
  channelPostId: string
  channelType: CommentAutomationChannelType
  commentId: string
  contactInbox: ContactInboxModel
  conversation: ConversationModel
  /** The comment is a reply to another comment rather than to the post. */
  isReply: boolean
  /** The comment was made during a live broadcast (Instagram flags it on the webhook, Facebook from the lookup). */
  isLive?: boolean
  savedComment: { createdAt: Date; id: string }
  settings: ChannelPostCommentSettings
  text: string | undefined
  workspaceId: string
}

/** At most one "quota reached" log per post and action in this window, so a busy post does not flood the log. */
const QUOTA_LOG_WINDOW_MS = 60 * 60 * 1000
const quotaLogKey = (channelPostId: string, action: string): string =>
  `post-comment-settings:quota-log:${channelPostId}:${action.replaceAll(" ", "-")}`

export type PostCommentSettingsOutcome = {
  /** The post hides this comment, so a comment automation must not also hide or later unhide it. */
  postHidesComment: boolean
}

type PostCommentRule = {
  applies: (input: PostCommentSettingsInput, hasPhone: boolean) => boolean
}

/** The per-post rules that hide a comment, in the order they are checked. */
const HIDE_RULES: PostCommentRule[] = [
  { applies: (input) => input.settings.hideComments },
  {
    applies: (input, hasPhone) => input.settings.hidePhoneComments && hasPhone,
  },
]

/**
 * Applies the per-post comment settings to a comment that is already stored:
 * hides it when a post rule says so, and marks it read when the post's
 * comments are skipped.
 *
 * Idempotent under webhook redelivery and job retry: the hide job has a fixed
 * id per comment and the read advance is a conditional "only forward" update.
 * Counting phone comments is separate (`countPhoneComment`) because it must not
 * depend on the workspace being active.
 */
export async function applyPostCommentSettings(
  input: PostCommentSettingsInput,
): Promise<PostCommentSettingsOutcome> {
  const hasPhone = input.text ? hasPhoneNumber(input.text) : false

  const wantsHide =
    HIDE_RULES.some((rule) => rule.applies(input, hasPhone)) &&
    supportsHideForComment(input.channelType, input.isReply) &&
    // A live comment is hidden only where the channel's live API allows it
    // (Instagram Live comments cannot be hidden); the same rule a Live
    // automation follows. Skip, phone count and triggers are unaffected.
    !(input.isLive && !liveCommentCapabilities(input.channelType).hideComments)
  // The quota is read once per comment and only when an action needs it.
  const room = onceRoom(input.workspaceId)
  // Hiding consumes a message: at the limit the comment is left as it is.
  // Propagates on failure: the job retries and the fixed job id keeps the
  // hide to a single run.
  const postHidesComment =
    wantsHide && (await hasMessageRoom(input, "hide comment", room))
  if (postHidesComment) {
    await enqueuePostHide(input)
  }

  await runBestEffort(input, "skip comment", async () => {
    if (input.settings.skipComments) {
      await skipComment(input, room)
    }
  })

  return { postHidesComment }
}

/**
 * Counts a stored comment that carries a phone number on its post. Runs right
 * after the comment is saved, for every delivery: the count is guarded by a mark
 * on the comment itself (`recordPhoneComment`), so a redelivery after success
 * counts nothing and a retry after a failure counts it. A real failure
 * propagates so the job retries; swallowing it would leave the count short for
 * good, because the retry could not tell the comment was never counted.
 */
export async function countPhoneComment(input: {
  channelPostId: string
  savedComment: { createdAt: Date; id: string }
  text: string | undefined
  workspaceId: string
}): Promise<void> {
  if (!(input.text && hasPhoneNumber(input.text))) {
    return
  }
  await channelPostService.recordPhoneComment({
    comment: {
      createdAt: input.savedComment.createdAt,
      id: input.savedComment.id,
    },
    id: input.channelPostId,
    workspaceId: input.workspaceId,
  })
}

/** Reads the owner's message room at most once, on first use. */
const onceRoom = (workspaceId: string): (() => Promise<boolean>) => {
  let pending: Promise<boolean> | undefined
  return () => {
    pending ??= messageUsageService.hasRoom(workspaceId)
    return pending
  }
}

/** Whether the owner can still consume a message; at the limit it logs (throttled per action) and answers false. */
async function hasMessageRoom(
  input: PostCommentSettingsInput,
  action: string,
  room: () => Promise<boolean>,
): Promise<boolean> {
  if (await room()) {
    return true
  }
  let isFirstInWindow = true
  try {
    isFirstInWindow = await casStore.setIfAbsent(
      quotaLogKey(input.channelPostId, action),
      1,
      QUOTA_LOG_WINDOW_MS,
    )
  } catch {
    // The log is only throttled; without Redis it is written every time.
  }
  if (isFirstInWindow) {
    logger.warn(
      {
        channelPostId: input.channelPostId,
        commentId: input.commentId,
        workspaceId: input.workspaceId,
      },
      `post-comment-settings: message quota reached, not applying "${action}"`,
    )
  }
  return false
}

/**
 * Marks the comment read when the post skips its comments, and charges one
 * message only when this call advanced the read mark (a redelivery finds it
 * advanced and charges nothing).
 */
async function skipComment(
  input: PostCommentSettingsInput,
  room: () => Promise<boolean>,
): Promise<void> {
  if (!(await hasMessageRoom(input, "skip comment", room))) {
    return
  }
  const advanced = await conversationService.markReadBySkippedPost({
    conversationId: input.conversation.id,
    readAt: input.savedComment.createdAt,
    workspaceId: input.workspaceId,
  })
  if (!advanced) {
    return
  }
  // A failed skip charge is dropped, not retried: an accepted under-count (docs/posts.md).
  await chargeCommentActionOnce({
    comment: input.savedComment,
    key: "quotaChargedSkip",
    workspaceId: input.workspaceId,
  })
}

async function enqueuePostHide(input: PostCommentSettingsInput): Promise<void> {
  await chatQueue.add(
    ChatJobAction.changeChannelMessageState,
    {
      type: ChatJobAction.changeChannelMessageState,
      data: {
        conversation: input.conversation,
        contactInbox: input.contactInbox,
        message: {
          id: input.savedComment.id,
          createdAt: input.savedComment.createdAt,
        },
        hidden: true,
        usageSource: "postCommentSetting",
      },
    },
    withReplayPriority({ jobId: `post-hide-comment-${input.commentId}` }),
  )
}

/**
 * A counter or a read marker must never fail comment ingestion: a retry would
 * find the comment already stored and skip the work anyway, so the failure is
 * logged and the comment carries on.
 */
async function runBestEffort(
  input: PostCommentSettingsInput,
  action: string,
  run: () => Promise<void>,
): Promise<void> {
  try {
    await run()
  } catch (err) {
    logger.warn(
      {
        err,
        channelPostId: input.channelPostId,
        commentId: input.commentId,
        workspaceId: input.workspaceId,
      },
      `post-comment-settings: failed to ${action}`,
    )
  }
}
