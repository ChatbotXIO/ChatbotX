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

// The leading half of a composite id — the object the comment hangs off
// (`{objectId}_{commentId}`). A bare id (Instagram) has no leading half and so
// answers itself, which reduces the comparison in `isCommentReply` to
// `parentId === commentId` — something no comment can satisfy. Instagram
// therefore never takes that branch.
function objectIdOf(id: string): string {
  const idx = id.indexOf("_")
  return idx === -1 ? id : id.slice(0, idx)
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
// comment it points at the post, and only a reply to another comment carries
// that comment's id instead.
//
// "Points at the post" is NOT reliably the same string as `post_id` — the
// composite Facebook puts in `parent_id` varies by post type. Two production
// payloads from one Page (2026-09-11):
//
//   reel   post_id   698869923319232_122151505431003083
//          parent_id 698869923319232_122151505431003083   identical
//   photo  post_id   698869923319232_122101949313003083
//          parent_id 39455509950714790_122101949313003083  leading half is the
//                                                          ALBUM, not the Page
//
// So a raw `parentId !== postId` reads every top-level comment on a photo post
// as a reply and, with the default `ignoreCommentReplies`, silently drops the
// whole automation. Both halves agree on the trailing story id, so compare on
// that like `matchPost` does.
//
// The `objectIdOf` comparison is a safety net for a bare `parent_id`, a shape
// no observed payload sends. It cannot misfire on a reply: a reply's
// `comment_id` stays anchored to the story (`{storyId}_{replyId}`) while its
// `parent_id` carries the parent comment's id, whose trailing half is that
// comment — never the story.
export function isCommentReply(
  parentId: string | undefined,
  postId: string,
  commentId: string,
): boolean {
  if (!parentId) {
    return false
  }
  const parent = normalizePostId(parentId)
  if (parent === normalizePostId(postId)) {
    return false
  }
  return parent !== objectIdOf(commentId)
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
