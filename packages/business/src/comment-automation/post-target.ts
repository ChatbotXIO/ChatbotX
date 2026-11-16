import {
  COMMENT_POST_HASHTAG_MAX_LENGTH,
  COMMENT_POST_HASHTAGS_MAX,
  type CommentPost,
  isHashtagCommentAutomation,
  isValidCommentPostHashtag,
  normalizeCommentPostHashtags,
} from "@chatbotx.io/database/partials"
import { validationException } from "../errors"

/**
 * Validates a post target and stores a `hashtags` list in its canonical form
 * (no `#`, NFC, lower case, no duplicates), so the worker compares like with
 * like. Every other target type passes through untouched.
 *
 * Runs on every write path — builder actions, the public API and the template
 * installer all funnel through the service — so a hashtag list can never be
 * stored in a shape the worker would silently fail to match.
 */
export function normalizeCommentPostTarget<Post extends CommentPost>(
  post: Post,
): Post {
  if (!isHashtagCommentAutomation(post)) {
    return post
  }
  const hashtags = normalizeCommentPostHashtags(post.value)
  if (hashtags.length === 0) {
    throw validationException("post.value", "Add at least one hashtag")
  }
  if (hashtags.length > COMMENT_POST_HASHTAGS_MAX) {
    throw validationException(
      "post.value",
      `Use at most ${COMMENT_POST_HASHTAGS_MAX} hashtags`,
      { max: COMMENT_POST_HASHTAGS_MAX },
    )
  }
  const invalid = hashtags.find((tag) => !isValidCommentPostHashtag(tag))
  if (invalid !== undefined) {
    throw validationException(
      "post.value",
      `Invalid hashtag "${invalid}": use letters, digits and _ only, at most ${COMMENT_POST_HASHTAG_MAX_LENGTH} characters`,
      { hashtag: invalid },
    )
  }
  return { ...post, value: hashtags }
}

/** Applies {@link normalizeCommentPostTarget} to a write's `post`, if present. */
export function withNormalizedPostTarget<T extends { post?: CommentPost }>(
  data: T,
): T {
  if (!data.post) {
    return data
  }
  return { ...data, post: normalizeCommentPostTarget(data.post) }
}
