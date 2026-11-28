import type {
  ChannelPostContentType,
  ChannelPostShareMode,
} from "@chatbotx.io/utils/channel-post"
import { countMessageCharacters } from "./characters"
import type { ChannelFlowPolicy } from "./policies/define"

/**
 * What a channel can do with one of the business's own posts: how it delivers
 * it, and which kinds of post it takes. A channel without one cannot send
 * posts, so a new channel opts in by declaring this in its policy.
 */
export type ChannelPostShareCapability = {
  mode: ChannelPostShareMode
  contentTypes: readonly ChannelPostContentType[]
}

/** The fields of a stored post the rule reads. */
export type ChannelPostShareCandidate = {
  contentType: ChannelPostContentType | null
  permalink: string | null
}

export const channelPostNotShareableReasons = [
  "typeNotShareable",
  "linkUnavailable",
  "linkTooLong",
  "shareUnsupported",
] as const
export type ChannelPostNotShareableReason =
  (typeof channelPostNotShareableReasons)[number]

export type ChannelPostShareable = {
  shareable: true
  mode: ChannelPostShareMode
}

export type ChannelPostNotShareable = {
  shareable: false
  reason: ChannelPostNotShareableReason
}

export type ChannelPostShareability =
  | ChannelPostShareable
  | ChannelPostNotShareable

/** The part of a channel policy the rule reads. */
export type ChannelPostSharePolicy = {
  limits: Pick<ChannelFlowPolicy["limits"], "text">
  channelPostShare?: ChannelPostShareCapability
}

/** Whether the mode needs the post's permalink to deliver it. */
const modeNeedsPermalink: Record<ChannelPostShareMode, boolean> = {
  nativeMedia: false,
  textLink: true,
}

export const channelPostShareModeNeedsPermalink = (
  mode: ChannelPostShareMode,
): boolean => modeNeedsPermalink[mode]

/**
 * The one rule that says whether a post can be sent through a channel. The
 * service refuses with it, and the pickers use it to show an unsendable post as
 * disabled with the reason, never hide it silently.
 */
export const getChannelPostShareability = (
  policy: ChannelPostSharePolicy,
  post: ChannelPostShareCandidate,
): ChannelPostShareability => {
  const capability = policy.channelPostShare
  if (!capability) {
    return { shareable: false, reason: "shareUnsupported" }
  }
  if (
    post.contentType === null ||
    !capability.contentTypes.includes(post.contentType)
  ) {
    return { shareable: false, reason: "typeNotShareable" }
  }
  if (modeNeedsPermalink[capability.mode]) {
    const permalink = post.permalink?.trim() ?? ""
    if (permalink === "") {
      return { shareable: false, reason: "linkUnavailable" }
    }
    // The link is never cut, so one longer than the text limit cannot be sent.
    if (countMessageCharacters(permalink) > policy.limits.text) {
      return { shareable: false, reason: "linkTooLong" }
    }
  }
  return { shareable: true, mode: capability.mode }
}
