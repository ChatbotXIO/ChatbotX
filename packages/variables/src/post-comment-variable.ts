import { channelPostService, messageService } from "@chatbotx.io/business"
import {
  POST_COMMENT_VARIABLE_NAMES,
  type PostCommentVariableName,
} from "@chatbotx.io/database/partials"
import { logger } from "./logger"
import type {
  PostCommentLoader,
  PostCommentVariableRef,
  PostCommentVariableValues,
  ReplaceVariableProps,
} from "./schema"
import { formatDateTime } from "./utils"

/** A well-formed `{{post.*}}` / `{{comment.*}}` token (it may have no comment to read). */
export const isPostCommentVariable = (
  variable: string,
): variable is PostCommentVariableName =>
  (POST_COMMENT_VARIABLE_NAMES as readonly string[]).includes(variable)

/** Memoizes `load`: started by the first call only, then shared. */
const memoize = <T>(load: () => Promise<T>): (() => Promise<T>) => {
  let loading: Promise<T> | undefined
  return () => {
    loading ??= load()
    return loading
  }
}

const loadValues = async (
  workspaceId: string,
  ref: PostCommentVariableRef,
): Promise<PostCommentVariableValues | null> => {
  const createdAt = new Date(ref.commentMessageCreatedAt)
  const [post, comment] = await Promise.all([
    channelPostService.findCommentVariableValues({
      channelPostId: ref.channelPostId,
      workspaceId,
    }),
    Number.isNaN(createdAt.getTime())
      ? null
      : messageService.findById({
          id: ref.commentMessageId,
          createdAt,
          workspaceId,
        }),
  ])
  if (!post) {
    return null
  }
  return {
    commentId: comment?.sourceId ?? "",
    commentText: comment && !comment.deletedAt ? (comment.text ?? "") : "",
    postId: post.externalPostId,
    postLink: post.permalink ?? "",
    postPageName: post.pageName,
    postPublishedAt: post.publishedAt,
    postText: post.text ?? "",
  }
}

/**
 * Lazy loader of the one comment a run is about. A lookup that fails renders
 * the tokens empty rather than failing the message that carries them.
 */
export const createPostCommentLoader = (
  workspaceId: string,
  ref: PostCommentVariableRef,
): PostCommentLoader => ({
  get: memoize(async () => {
    try {
      return await loadValues(workspaceId, ref)
    } catch (err) {
      logger.warn(
        { err, channelPostId: ref.channelPostId },
        "Unable to load post comment variables",
      )
      return null
    }
  }),
})

const readValue = (
  values: PostCommentVariableValues,
  variable: PostCommentVariableName,
  timezone: string | null,
): string => {
  switch (variable) {
    case "post.link":
      return values.postLink
    case "post.text":
      return values.postText
    case "post.published_at":
      return formatDateTime(values.postPublishedAt, timezone) ?? ""
    case "post.page_name":
      return values.postPageName
    case "post.id":
      return values.postId
    case "comment.text":
      return values.commentText
    case "comment.id":
      return values.commentId
    default: {
      const exhaustive: never = variable
      throw new Error(`Unhandled post comment variable: ${String(exhaustive)}`)
    }
  }
}

/** Value of a `{{post.*}}` / `{{comment.*}}` token; "" outside a post-comment run. */
export const resolvePostCommentVariable = async (
  context: ReplaceVariableProps,
  variable: string,
  timezone: string | null,
): Promise<string> => {
  if (!isPostCommentVariable(variable)) {
    return ""
  }
  const values = await context.postComment?.get()
  return values ? readValue(values, variable, timezone) : ""
}
