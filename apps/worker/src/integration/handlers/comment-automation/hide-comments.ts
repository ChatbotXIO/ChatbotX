import type {
  CommentHideComments,
  CommentModerationAction,
  CommentModerationRule,
} from "@chatbotx.io/database/partials"
import type {
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import { hasLink } from "@chatbotx.io/utils/has-link"
import { normalizeForMatch } from "@chatbotx.io/utils/normalize-for-match"
import { ChatJobAction, chatQueue } from "@chatbotx.io/worker-config"
import type { CommentAutomationChannelType } from "./channel-type"
import { withReplayPriority } from "./replay-priority"

/**
 * Whether the channel can hide (and later unhide) a comment.
 *
 * Hiding maps to Meta's `POST /{comment-id}?is_hidden=true` for Facebook and
 * Instagram comments, to `business/comment/hide/` on TikTok, and to
 * `POST /{reply-id}/manage_reply` on Threads (top-level replies only — see
 * {@link supportsHideForComment}).
 *
 * An allowlist rather than a chain of `!==`: a channel added without a decision
 * here should default to "cannot", not inherit the capability by omission.
 */
const CHANNELS_WITH_HIDE_COMMENTS = new Set<CommentAutomationChannelType>([
  "messenger",
  "instagram",
  "instagramFacebook",
  "threads",
  "tiktok",
])

export function supportsHideComments(
  channelType: CommentAutomationChannelType,
): boolean {
  return CHANNELS_WITH_HIDE_COMMENTS.has(channelType)
}

/**
 * Channels whose hide endpoint only accepts a top-level comment. Threads'
 * `manage_reply` always rejects a nested reply — and the state change writes
 * `attributes.hidden` to the DB before calling the channel, so letting one
 * through leaves the inbox showing a hidden reply that is still public, plus a
 * failing job and a failing unhide job later.
 */
const CHANNELS_HIDING_TOP_LEVEL_ONLY = new Set<CommentAutomationChannelType>([
  "threads",
])

/** Whether this specific comment can be hidden on its channel. */
export function supportsHideForComment(
  channelType: CommentAutomationChannelType,
  isReply: boolean,
): boolean {
  return (
    supportsHideComments(channelType) &&
    !(isReply && CHANNELS_HIDING_TOP_LEVEL_ONLY.has(channelType))
  )
}

/**
 * Any emoji that renders as one (😀, ❤️, 👍🏽 …). Not `\p{Emoji}`, which also
 * covers the plain digits and `#`/`*` that only render as emoji inside a
 * keycap sequence — a phone number would read as an emoji comment. Not bare
 * `\p{Extended_Pictographic}` either, which also covers text-default symbols
 * (©, ®, ™, ‼, ↔, ℹ) that appear in ordinary comments: those count only when
 * followed by the U+FE0F emoji-presentation selector (e.g. ❤️ = ❤ + U+FE0F).
 */
const EMOJI_RE = /\p{Emoji_Presentation}|\p{Extended_Pictographic}️/u

export function hasEmoji(text: string): boolean {
  return EMOJI_RE.test(text)
}

/**
 * Whether the automation's hide rules ask for anything at all (AI moderation
 * aside). Lets the orchestrator skip the whole hide path (including the
 * attachment lookup) for an all-defaults config, and lets it report the
 * unsupported capability only when the user actually configured one.
 */
export function hasHideRule(hideComments: CommentHideComments): boolean {
  return (
    hideComments.all ||
    hideComments.hasPhoneNumber ||
    hideComments.hasImage ||
    hideComments.hasVideo ||
    hideComments.hasLink ||
    hideComments.hasKeywords ||
    Boolean(hideComments.hasGif) ||
    Boolean(hideComments.hasEmoji) ||
    hideComments.showCommentsAfter !== "none"
  )
}

const PHONE_RE = /\+?\d[\d\s\-().]{7,}/
const UNHIDE_DELAY_MS: Record<string, number> = {
  "6h": 6 * 3_600_000,
  "12h": 12 * 3_600_000,
  "1d": 86_400_000,
  "2d": 2 * 86_400_000,
  "3d": 3 * 86_400_000,
  "4d": 4 * 86_400_000,
  "5d": 5 * 86_400_000,
  "6d": 6 * 86_400_000,
  "7d": 7 * 86_400_000,
  "8d": 8 * 86_400_000,
  "9d": 9 * 86_400_000,
  "10d": 10 * 86_400_000,
}

export type HideRuleMatch = {
  rule: CommentModerationRule
  /** The configured keyword that matched a `keyword` rule. */
  matchedKeyword?: string
}

/**
 * The first hide rule the comment trips, in the order the switches are listed
 * in the form — or null. Pure: the caller records the match and enqueues the
 * hide, so the moderation log can say exactly which rule fired.
 */
export function matchHideRule(
  hideComments: CommentHideComments,
  message: string | undefined,
  attachments: { hasImage: boolean; hasVideo: boolean; hasGif: boolean },
): HideRuleMatch | null {
  const text = message ?? ""

  if (hideComments.all) {
    return { rule: "all" }
  }
  if (hideComments.hasPhoneNumber && PHONE_RE.test(text)) {
    return { rule: "phoneNumber" }
  }
  if (hideComments.hasLink && hasLink(text)) {
    return { rule: "link" }
  }
  if (hideComments.hasKeywords) {
    const normalizedText = normalizeForMatch(text)
    const matchedKeyword = hideComments.keywords.find((keyword) =>
      normalizedText.includes(normalizeForMatch(keyword)),
    )
    if (matchedKeyword !== undefined) {
      return { rule: "keyword", matchedKeyword }
    }
  }
  if (hideComments.hasImage && attachments.hasImage) {
    return { rule: "image" }
  }
  if (hideComments.hasVideo && attachments.hasVideo) {
    return { rule: "video" }
  }
  if (hideComments.hasGif && attachments.hasGif) {
    return { rule: "gif" }
  }
  if (hideComments.hasEmoji && hasEmoji(text)) {
    return { rule: "emoji" }
  }
  return null
}

/**
 * Enqueues the channel-side hide or delete of a moderated comment. The job
 * carries `moderation` so its handler settles the `CommentModerationLog` row.
 *
 * `showCommentsAfter` schedules an unhide for a hide only; a deleted comment
 * cannot come back.
 */
export async function enqueueModerationAction(props: {
  action: CommentModerationAction
  automationId: string
  commentId: string
  showCommentsAfter: CommentHideComments["showCommentsAfter"]
  conversation: ConversationModel
  contactInbox: ContactInboxModel
  messageId: string
  messageCreatedAt: Date
}): Promise<void> {
  const message = { id: props.messageId, createdAt: props.messageCreatedAt }
  const moderation = {
    automationId: props.automationId,
    commentId: props.commentId,
  }
  // One job per moderated comment: a redelivery that re-enqueues a still
  // pending action joins the queued job instead of hiding or deleting twice.
  const options = withReplayPriority({
    jobId: `moderate-comment-${props.automationId}-${props.commentId}`,
  })

  if (props.action === "delete") {
    await chatQueue.add(
      ChatJobAction.deleteChannelMessage,
      {
        type: ChatJobAction.deleteChannelMessage,
        data: {
          conversation: props.conversation,
          contactInbox: props.contactInbox,
          message,
          moderation,
        },
      },
      options,
    )
    return
  }

  await chatQueue.add(
    ChatJobAction.changeChannelMessageState,
    {
      type: ChatJobAction.changeChannelMessageState,
      data: {
        conversation: props.conversation,
        contactInbox: props.contactInbox,
        message,
        hidden: true,
        moderation,
      },
    },
    options,
  )

  if (props.showCommentsAfter !== "none") {
    const delay = UNHIDE_DELAY_MS[props.showCommentsAfter] ?? 0
    await chatQueue.add(
      ChatJobAction.changeChannelMessageState,
      {
        type: ChatJobAction.changeChannelMessageState,
        data: {
          conversation: props.conversation,
          contactInbox: props.contactInbox,
          message,
          hidden: false,
        },
      },
      withReplayPriority({ delay, jobId: `unhide-comment-${props.commentId}` }),
    )
  }
}
