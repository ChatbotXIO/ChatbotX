import { rescue, TiktokAPIException } from "../exception"
import { createTiktokBusinessClient } from "../lib/http-client"
import type {
  BusinessApiResponse,
  TiktokComment,
  TiktokCommentHideAction,
  TiktokCommentImageUploadResult,
  TiktokCommentLikeAction,
  TiktokCommentListOptions,
  TiktokCommentListResult,
} from "../schema"

/**
 * The Business API answers HTTP 200 even when it rejects the call — the verdict
 * is `code`, where 0 means success. Every endpoint here funnels through this so
 * a rejection can never be mistaken for an empty result.
 */
const unwrap = <T>(response: BusinessApiResponse<T>, endpoint: string): T => {
  if (response.code !== 0) {
    throw new TiktokAPIException(response.message ?? `${endpoint} failed`)
  }
  return response.data
}

/** Query params are strings on the wire; arrays go as JSON. */
const toSearchParams = (
  params: Record<string, string | number | boolean | string[] | undefined>,
): Record<string, string> => {
  const searchParams: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue
    }
    searchParams[key] = Array.isArray(value)
      ? JSON.stringify(value)
      : `${value}`
  }
  return searchParams
}

const listOptionParams = (options: TiktokCommentListOptions | undefined) => ({
  status: options?.status,
  sort_field: options?.sortField,
  sort_type: options?.sortType,
  cursor: options?.cursor,
  max_count: options?.maxCount,
})

/**
 * Comments on an owned video.
 *
 * Pass `commentIds` to fetch specific comments — that is how a `comment.update`
 * webhook, which carries no commenter name or avatar, is enriched into a full
 * identity before a contact is created for it.
 */
export const listTiktokComments = (
  accessToken: string,
  params: {
    businessId: string
    videoId: string
    commentIds?: string[]
    includeReplies?: boolean
  } & TiktokCommentListOptions,
): Promise<TiktokCommentListResult> =>
  rescue("business/comment/list", async () => {
    const client = createTiktokBusinessClient(accessToken)
    const response = await client.get<
      BusinessApiResponse<TiktokCommentListResult>
    >("business/comment/list/", {
      searchParams: toSearchParams({
        business_id: params.businessId,
        video_id: params.videoId,
        comment_ids: params.commentIds,
        include_replies: params.includeReplies,
        ...listOptionParams(params),
      }),
    })

    return unwrap(response, "business/comment/list") ?? {}
  })

/** Replies to one comment on an owned video. */
export const listTiktokCommentReplies = (
  accessToken: string,
  params: {
    businessId: string
    videoId: string
    commentId: string
  } & TiktokCommentListOptions,
): Promise<TiktokCommentListResult> =>
  rescue("business/comment/reply/list", async () => {
    const client = createTiktokBusinessClient(accessToken)
    const response = await client.get<
      BusinessApiResponse<TiktokCommentListResult>
    >("business/comment/reply/list/", {
      searchParams: toSearchParams({
        business_id: params.businessId,
        video_id: params.videoId,
        comment_id: params.commentId,
        ...listOptionParams(params),
      }),
    })

    return unwrap(response, "business/comment/reply/list") ?? {}
  })

/** A new top-level comment on an owned video, as the business. */
export const createComment = (
  accessToken: string,
  params: {
    businessId: string
    videoId: string
    text: string
    imageUri?: string
    imageWidth?: number
    imageHeight?: number
  },
): Promise<TiktokComment> =>
  rescue("business/comment/create", async () => {
    const client = createTiktokBusinessClient(accessToken)
    const response = await client.post<BusinessApiResponse<TiktokComment>>(
      "business/comment/create/",
      {
        json: {
          business_id: params.businessId,
          video_id: params.videoId,
          text: params.text,
          image_uri: params.imageUri,
          image_width: params.imageWidth,
          image_height: params.imageHeight,
        },
      },
    )

    return unwrap(response, "business/comment/create")
  })

/**
 * A public reply to an existing comment.
 *
 * NOT idempotent — a retry posts a second reply under the same comment, which
 * is why the comment-automation retry policy has to cap TikTok at one attempt.
 */
export const replyToComment = (
  accessToken: string,
  params: {
    businessId: string
    videoId: string
    commentId: string
    text: string
    imageUri?: string
    imageWidth?: number
    imageHeight?: number
  },
): Promise<TiktokComment> =>
  rescue("business/comment/reply/create", async () => {
    const client = createTiktokBusinessClient(accessToken)
    const response = await client.post<BusinessApiResponse<TiktokComment>>(
      "business/comment/reply/create/",
      {
        json: {
          business_id: params.businessId,
          video_id: params.videoId,
          comment_id: params.commentId,
          text: params.text,
          image_uri: params.imageUri,
          image_width: params.imageWidth,
          image_height: params.imageHeight,
        },
      },
    )

    return unwrap(response, "business/comment/reply/create")
  })

/** Like or unlike a comment as the business. Takes no `video_id`. */
export const likeComment = (
  accessToken: string,
  params: {
    businessId: string
    commentId: string
    action: TiktokCommentLikeAction
  },
): Promise<void> =>
  rescue("business/comment/like", async () => {
    const client = createTiktokBusinessClient(accessToken)
    const response = await client.post<BusinessApiResponse<unknown>>(
      "business/comment/like/",
      {
        json: {
          business_id: params.businessId,
          comment_id: params.commentId,
          action: params.action,
        },
      },
    )

    unwrap(response, "business/comment/like")
  })

/** Hide a comment from everyone but its author, or restore it. */
export const hideComment = (
  accessToken: string,
  params: {
    businessId: string
    videoId: string
    commentId: string
    action: TiktokCommentHideAction
  },
): Promise<void> =>
  rescue("business/comment/hide", async () => {
    const client = createTiktokBusinessClient(accessToken)
    const response = await client.post<BusinessApiResponse<unknown>>(
      "business/comment/hide/",
      {
        json: {
          business_id: params.businessId,
          video_id: params.videoId,
          comment_id: params.commentId,
          action: params.action,
        },
      },
    )

    unwrap(response, "business/comment/hide")
  })

/** Permanently delete a comment on an owned video. Takes no `video_id`. */
export const deleteComment = (
  accessToken: string,
  params: { businessId: string; commentId: string },
): Promise<void> =>
  rescue("business/comment/delete", async () => {
    const client = createTiktokBusinessClient(accessToken)
    const response = await client.post<BusinessApiResponse<unknown>>(
      "business/comment/delete/",
      {
        json: {
          business_id: params.businessId,
          comment_id: params.commentId,
        },
      },
    )

    unwrap(response, "business/comment/delete")
  })

/**
 * Uploads an image for a comment or reply.
 *
 * The returned `image_uri` (plus its width/height) is what
 * `createComment` / `replyToComment` take — a comment cannot carry
 * a raw image, only an already-uploaded reference.
 */
export const uploadCommentImage = (
  accessToken: string,
  params: { businessId: string; imageUrl: string },
): Promise<TiktokCommentImageUploadResult> =>
  rescue("business/comment/image/upload", async () => {
    const imageResponse = await fetch(params.imageUrl)
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${params.imageUrl}`)
    }
    const blob = await imageResponse.blob()

    const form = new FormData()
    form.append("business_id", params.businessId)
    form.append("file", blob)

    const client = createTiktokBusinessClient(accessToken)
    const response = await client.postFormData<
      BusinessApiResponse<TiktokCommentImageUploadResult>
    >("business/comment/image/upload/", form)

    const data = unwrap(response, "business/comment/image/upload")
    if (!data?.image_uri) {
      throw new Error("No image_uri in TikTok comment image upload response")
    }
    return data
  })
