import type {
  FBCommentIncludeKeywords,
  FBCommentPost,
  FBCommentReply,
  FBCommentReplyAfter,
} from "@chatbotx.io/database/partials"

const RANDOM_DELAY_MINUTES: Record<string, number> = {
  randomWithin3Minutes: 3,
  randomWithin5Minutes: 5,
  randomWithin10Minutes: 10,
  randomWithin20Minutes: 20,
  randomWithin30Minutes: 30,
  randomWithin60Minutes: 60,
}

// Facebook post ids are composite `{pageId}_{storyId}`. The published/ads
// pickers store that composite form, but the reels picker stores a bare id and
// users pasting an id manually often omit the `{pageId}_` prefix. Compare on the
// trailing story id (unique) so all three formats match the webhook `post_id`.
function normalizePostId(id: string): string {
  const idx = id.indexOf("_")
  return idx === -1 ? id : id.slice(idx + 1)
}

export function matchPost(post: FBCommentPost, postId: string): boolean {
  if (post.type !== "postIds") {
    return true
  }
  const target = normalizePostId(postId)
  return post.value.some((v) => v === postId || normalizePostId(v) === target)
}

export function matchKeywords(
  includeKeywords: FBCommentIncludeKeywords,
  excludeKeywords: string[],
  message: string | undefined,
): boolean {
  const text = (message ?? "").toLowerCase()
  if (includeKeywords.type !== "all" && includeKeywords.value.length > 0) {
    const kws = includeKeywords.value.map((k) => k.toLowerCase())
    if (includeKeywords.type === "equal" && !kws.includes(text)) {
      return false
    }
    if (
      includeKeywords.type === "contain" &&
      !kws.some((k) => text.includes(k))
    ) {
      return false
    }
  }
  if (excludeKeywords.some((k) => text.includes(k.toLowerCase()))) {
    return false
  }
  return true
}

// Facebook feed webhooks set parent_id on every comment: for a top-level
// comment it equals the post id, and only a reply to another comment carries
// that comment's id instead.
export function isCommentReply(
  parentId: string | undefined,
  postId: string,
): boolean {
  return Boolean(parentId) && parentId !== postId
}

export function willSendReply(reply: FBCommentReply): boolean {
  if (reply.type === "none") {
    return false
  }
  // text/flow need a value; AIAgent needs the selected agent id in `value`.
  return Boolean(reply.value)
}

export function computeDelayMs(replyAfter: FBCommentReplyAfter): number {
  if (replyAfter.type === "immediately") {
    return 0
  }
  if (replyAfter.type === "seconds") {
    return replyAfter.value * 1000
  }
  if (replyAfter.type === "minutes") {
    return replyAfter.value * 60_000
  }
  if (replyAfter.type === "hours") {
    return replyAfter.value * 3_600_000
  }
  const minutes =
    RANDOM_DELAY_MINUTES[replyAfter.type as keyof typeof RANDOM_DELAY_MINUTES]
  return Math.floor(Math.random() * (minutes ?? 3) * 60_000)
}
