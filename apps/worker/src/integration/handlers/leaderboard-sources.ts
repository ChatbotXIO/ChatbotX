import {
  enqueueLeaderboardAward,
  inboxHasLeaderboardRule,
} from "@chatbotx.io/business/leaderboard"
import { channelPostRepository } from "@chatbotx.io/database/repositories"
import type { InboxModel, MessageModel } from "@chatbotx.io/database/types"
import {
  getStoryReply,
  isStoryMention,
  type MessageReferral,
} from "@chatbotx.io/sdk"
import { normalizePostId } from "./comment-automation/automation-matching"

type LeaderboardInbox = Pick<InboxModel, "id" | "workspaceId" | "channel">
type SavedMessage = Pick<
  MessageModel,
  "id" | "sourceId" | "createdAt" | "messageType" | "text" | "contentAttributes"
>

const EMOJI_ONLY_PATTERN =
  /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s)+$/u
const PICTOGRAPHIC_PATTERN = /\p{Extended_Pictographic}/u

/**
 * Instagram delivers a quick emoji reaction to a story as a story reply whose
 * text is only the emoji; a typed reply has words in it.
 */
export const isEmojiOnlyText = (text: string | null | undefined): boolean => {
  const trimmed = text?.trim()
  return Boolean(
    trimmed &&
      EMOJI_ONLY_PATTERN.test(trimmed) &&
      PICTOGRAPHIC_PATTERN.test(trimmed),
  )
}

/** A Meta click-to-WhatsApp ad referral (a Google click id alone does not count). */
const isCtwaReferral = (referral: MessageReferral | null | undefined) =>
  Boolean(referral && (referral.ctwaClid || referral.adId))

/**
 * Leaderboard rules scored by a newly stored inbound message: Zalo messages,
 * WhatsApp click-to-WhatsApp ad clicks, Instagram story mentions and quick
 * story reactions. Call only when the message is NEW (`isNew`), so webhook
 * redeliveries never queue twice; the saved row's own time is the event
 * time. Never throws.
 */
export async function awardInboundMessageLeaderboard(props: {
  inbox: LeaderboardInbox
  contactId: string
  message: SavedMessage
  referral?: MessageReferral | null
}): Promise<void> {
  const { inbox, contactId, message, referral } = props
  if (message.messageType !== "incoming") {
    return
  }
  const sourceRef = message.sourceId ?? message.id
  const base = {
    workspaceId: inbox.workspaceId,
    contactId,
    inboxId: inbox.id,
    eventAt: message.createdAt,
  }

  if (inbox.channel === "zalo") {
    await enqueueLeaderboardAward({ ...base, rule: "message", sourceRef })
    return
  }
  if (inbox.channel === "whatsapp") {
    if (isCtwaReferral(referral)) {
      await enqueueLeaderboardAward({
        ...base,
        rule: "ctwaReactions",
        sourceRef: `ctwa:${referral?.ctwaClid ?? sourceRef}`,
      })
    }
    return
  }
  if (inbox.channel === "instagram") {
    if (isStoryMention(message.contentAttributes)) {
      await enqueueLeaderboardAward({
        ...base,
        rule: "storyMention",
        sourceRef,
      })
      return
    }
    if (
      getStoryReply(message.contentAttributes) &&
      isEmojiOnlyText(message.text)
    ) {
      await enqueueLeaderboardAward({
        ...base,
        rule: "storyReaction",
        sourceRef,
      })
    }
  }
}

/** Publish time of a tracked post, read only when a leaderboard listens. */
const findPostPublishedAt = async (props: {
  inbox: LeaderboardInbox
  channelPostId: string | null
  rule: "comments" | "liveComments"
}): Promise<string | undefined> => {
  if (
    props.rule !== "comments" ||
    !props.channelPostId ||
    !(await inboxHasLeaderboardRule(props.inbox.id, "comments"))
  ) {
    return
  }
  const [post] = await channelPostRepository.findByIds({
    ids: [props.channelPostId],
    workspaceId: props.inbox.workspaceId,
  })
  return post?.publishedAt?.toISOString()
}

/**
 * Leaderboard "comments" / "liveComments" for a newly stored top-level
 * comment (replies to a comment do not score). The comment id is the
 * sourceRef and the stored row's time the event time. Never throws: the post
 * lookup is best-effort and the enqueue itself never throws.
 */
export async function awardCommentLeaderboard(props: {
  inbox: LeaderboardInbox
  contactId: string
  commentId: string
  externalPostId: string
  /** Internal `ChannelPost` id, when the channel tracks posts. */
  channelPostId: string | null
  text: string | null | undefined
  isLive: boolean
  isReply: boolean
  eventAt: Date
}): Promise<void> {
  if (props.isReply) {
    return
  }
  const rule = props.isLive ? "liveComments" : "comments"
  const postPublishedAt = await findPostPublishedAt({
    inbox: props.inbox,
    channelPostId: props.channelPostId,
    rule,
  }).catch(() => undefined)
  await enqueueLeaderboardAward({
    workspaceId: props.inbox.workspaceId,
    contactId: props.contactId,
    inboxId: props.inbox.id,
    rule,
    sourceRef: props.commentId,
    eventAt: props.eventAt,
    context: {
      postId: normalizePostId(props.externalPostId),
      textLength: props.text?.length ?? 0,
      ...(postPublishedAt ? { postPublishedAt } : {}),
    },
  })
}

/**
 * WhatsApp "CTWA Click & Reactions": a NEW reaction (not a re-react or an
 * unreact) on a WhatsApp thread scores once per reacted message.
 */
export async function awardReactionLeaderboard(props: {
  inbox: LeaderboardInbox
  contactId: string
  reactionSourceId: string
  action: "react" | "unreact"
  eventAt: Date
}): Promise<void> {
  if (props.inbox.channel !== "whatsapp" || props.action !== "react") {
    return
  }
  await enqueueLeaderboardAward({
    workspaceId: props.inbox.workspaceId,
    contactId: props.contactId,
    inboxId: props.inbox.id,
    rule: "ctwaReactions",
    sourceRef: props.reactionSourceId,
    eventAt: props.eventAt,
  })
}
