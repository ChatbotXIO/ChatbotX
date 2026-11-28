import {
  type ChannelPostForShare,
  type ChannelPostShareCriterion,
  channelPostRepository,
} from "@chatbotx.io/database/repositories"
import {
  CHANNEL_FLOW_POLICIES,
  type ChannelFlowPolicy,
  type ChannelPostNotShareableReason,
  channelPostShareModeNeedsPermalink,
  countMessageCharacters,
  getChannelFlowPolicy,
  getChannelPostShareability,
} from "@chatbotx.io/flow-config"
import type { MessageChannelPostEntity } from "@chatbotx.io/sdk"
import { channelTypes } from "@chatbotx.io/utils/channel"
import type {
  ChannelPostShareMode,
  ChannelPostShareRefusalReason,
} from "@chatbotx.io/utils/channel-post"
import { BaseService } from "../base.service"
import { ChannelPostShareRefusedError } from "../errors"

/** The platform sends the post itself, by its own id. */
export type NativeChannelPostShare = {
  mode: "nativeMedia"
  externalPostId: string
}

/** The channel sends a plain text holding the post's name and link. */
export type TextLinkChannelPostShare = {
  mode: "textLink"
  text: string
}

export type ChannelPostShareContent =
  | NativeChannelPostShare
  | TextLinkChannelPostShare

/** A post, resolved and checked for one send on one inbox. */
export type ResolvedChannelPostShare = {
  post: ChannelPostForShare
  content: ChannelPostShareContent
}

/** What a sender stores on the message row and dispatches. */
export type PreparedChannelPostShare = ResolvedChannelPostShare & {
  /** The text the message row carries: the built text for `textLink`, none for `nativeMedia`. */
  text: string | null
  contentAttributes: MessageChannelPostEntity
}

type ShareBuilderInput = {
  post: ChannelPostForShare
  policy: Pick<ChannelFlowPolicy, "limits">
}

const ELLIPSIS = "…"
const LINE_BREAK = /\r?\n/
const NAME_LINK_SEPARATOR = "\n"
const graphemeSegmenter = new Intl.Segmenter(undefined, {
  granularity: "grapheme",
})

/**
 * The first non-blank line of a caption, trimmed: the name a text share leads
 * with. `null` when the caption holds nothing to show.
 */
const captionName = (caption: string | null): string | null => {
  const line = (caption ?? "")
    .split(LINE_BREAK)
    .map((candidate) => candidate.trim())
    .find((candidate) => candidate !== "")
  return line ?? null
}

/**
 * Cuts `name` to at most `budget` characters (counted like the channel limit
 * counts them), ending in an ellipsis. Cuts between grapheme clusters, so an
 * emoji, a surrogate pair or a joined sequence is kept whole or dropped whole.
 */
const truncateName = (name: string, budget: number): string => {
  if (countMessageCharacters(name) <= budget) {
    return name
  }
  let kept = ""
  let used = 0
  const room = budget - countMessageCharacters(ELLIPSIS)
  for (const { segment } of graphemeSegmenter.segment(name)) {
    const size = countMessageCharacters(segment)
    if (used + size > room) {
      break
    }
    kept += segment
    used += size
  }
  const trimmed = kept.trimEnd()
  return trimmed === "" ? "" : `${trimmed}${ELLIPSIS}`
}

/**
 * The text a `textLink` share sends: the caption's first line, a line break and
 * the permalink; the permalink alone when there is no caption. The whole text
 * fits `limit` characters: the name is shortened, the link never is.
 */
export const buildTextLinkShareText = (props: {
  caption: string | null
  permalink: string
  limit: number
}): string => {
  const permalink = props.permalink.trim()
  const name = captionName(props.caption)
  if (!name) {
    return permalink
  }
  const budget =
    props.limit -
    countMessageCharacters(permalink) -
    countMessageCharacters(NAME_LINK_SEPARATOR)
  const fitted = truncateName(name, budget)
  return fitted === ""
    ? permalink
    : `${fitted}${NAME_LINK_SEPARATOR}${permalink}`
}

/**
 * How each share mode turns a post into what is sent. A channel only declares
 * its mode in its policy, so a new channel needs no branch here.
 */
const channelPostShareBuilders: Record<
  ChannelPostShareMode,
  (input: ShareBuilderInput) => ChannelPostShareContent
> = {
  nativeMedia: ({ post }) => ({
    mode: "nativeMedia",
    externalPostId: post.externalPostId,
  }),
  textLink: ({ post, policy }) => ({
    mode: "textLink",
    text: buildTextLinkShareText({
      caption: post.caption,
      // `getChannelPostShareability` already refused a post without one.
      permalink: post.permalink ?? "",
      limit: policy.limits.text,
    }),
  }),
}

const refusalOfNotShareable: Record<
  ChannelPostNotShareableReason,
  ChannelPostShareRefusalReason
> = {
  typeNotShareable: "channelPostTypeNotShareable",
  linkUnavailable: "channelPostLinkUnavailable",
  linkTooLong: "channelPostLinkTooLong",
  shareUnsupported: "channelPostShareUnsupported",
}

export type ChannelPostShareInput = {
  /** The channel of the conversation's inbox. */
  channel: string
  channelPostId: string
  inboxId: string
  workspaceId: string
}

class ChannelPostShareService extends BaseService {
  /**
   * The one place that decides whether a post can be sent on an inbox and what
   * is sent. The composer, the public API and the worker (flow steps, and the
   * re-check when a queued send runs) all call it, so they always agree.
   * Throws `ChannelPostShareRefusedError` with the reason.
   */
  async resolveForSend(
    input: ChannelPostShareInput,
  ): Promise<ResolvedChannelPostShare> {
    const policy = getChannelFlowPolicy(input.channel)
    if (!policy?.channelPostShare) {
      throw new ChannelPostShareRefusedError("channelPostShareUnsupported")
    }
    const post = await channelPostRepository.findForInbox({
      channelPostId: input.channelPostId,
      inboxId: input.inboxId,
      workspaceId: input.workspaceId,
    })
    if (!post) {
      throw new ChannelPostShareRefusedError("channelPostNotFound")
    }
    if (!post.inboxMatches) {
      throw new ChannelPostShareRefusedError("channelPostInboxMismatch")
    }
    const shareability = getChannelPostShareability(policy, post)
    if (!shareability.shareable) {
      throw new ChannelPostShareRefusedError(
        refusalOfNotShareable[shareability.reason],
      )
    }
    return {
      post,
      content: channelPostShareBuilders[shareability.mode]({ post, policy }),
    }
  }

  /** `resolveForSend`, plus the text and `contentAttributes` the message row stores. */
  async prepareOutgoing(
    input: ChannelPostShareInput,
  ): Promise<PreparedChannelPostShare> {
    const resolved = await this.resolveForSend(input)
    return {
      ...resolved,
      text: resolved.content.mode === "textLink" ? resolved.content.text : null,
      contentAttributes: {
        type: "channel_post",
        shareMode: resolved.content.mode,
        channelPostId: resolved.post.id,
        externalPostId: resolved.post.externalPostId,
        permalink: resolved.post.permalink,
        thumbnail: resolved.post.thumbnail,
        caption: resolved.post.caption,
      },
    }
  }

  /**
   * The channels' rules as SQL criteria for `channelPostManagement.list`'s
   * `shareableOnly`: one per channel whose policy can send posts.
   */
  shareCriteria(): ChannelPostShareCriterion[] {
    return Object.entries(CHANNEL_FLOW_POLICIES).flatMap(([channel, policy]) =>
      channel !== channelTypes.enum.omnichannel && policy.channelPostShare
        ? [
            {
              channel,
              contentTypes: [...policy.channelPostShare.contentTypes],
              requirePermalink: channelPostShareModeNeedsPermalink(
                policy.channelPostShare.mode,
              ),
            },
          ]
        : [],
    )
  }
}

export const channelPostShareService = new ChannelPostShareService()
