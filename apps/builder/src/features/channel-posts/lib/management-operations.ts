import {
  channelPostCommentsService,
  channelPostExportService,
  channelPostManagementService,
} from "@chatbotx.io/business"
import type { z } from "zod"
import type {
  bulkUpdateChannelPostManagementRequest,
  deleteChannelPostCommentRequest,
  exportChannelPostCommentsRequest,
  likeChannelPostCommentRequest,
  listChannelPostAuthorsRequest,
  listChannelPostCommentsRequest,
  listChannelPostManagementRequest,
  mergeChannelPostCommentsRequest,
  updateChannelPostManagementRequest,
} from "../schema/management"

type ListInput = z.output<typeof listChannelPostManagementRequest>
type UpdateInput = z.output<typeof updateChannelPostManagementRequest>
type BulkUpdateInput = z.output<typeof bulkUpdateChannelPostManagementRequest>
type ListAuthorsInput = z.output<typeof listChannelPostAuthorsRequest>
type ListCommentsInput = z.output<typeof listChannelPostCommentsRequest>
type MergeCommentsInput = z.output<typeof mergeChannelPostCommentsRequest>
type LikeCommentInput = z.output<typeof likeChannelPostCommentRequest>
type ExportCommentsInput = z.output<typeof exportChannelPostCommentsRequest>
type DeleteCommentInput = z.output<typeof deleteChannelPostCommentRequest>

/** Who is asking, as far as comment data goes: may they see phone numbers? */
export type CommentCaller = {
  canViewEmailAndPhone: boolean
  workspaceId: string
}

/**
 * The management operations the public API and the page's session procedures
 * share: both parse their own request shape and call these, so a rule changes
 * in one place.
 */
export const channelPostManagementOperations = {
  list: async (workspaceId: string, input: ListInput) => {
    const { cursor, hasComments = true, limit, sort, ...filters } = input
    return await channelPostManagementService.list({
      cursor,
      filters: { ...filters, hasComments },
      limit,
      sort,
      workspaceId,
    })
  },

  update: async (workspaceId: string, input: UpdateInput) =>
    await channelPostManagementService.update({
      id: input.id,
      settings: {
        hideComments: input.hideComments,
        hidePhoneComments: input.hidePhoneComments,
        skipComments: input.skipComments,
      },
      topicIds: input.topicIds,
      workspaceId,
    }),

  bulkUpdate: async (workspaceId: string, input: BulkUpdateInput) =>
    await channelPostManagementService.bulkUpdate({
      addTopicIds: input.addTopicIds,
      ids: input.ids,
      removeTopicIds: input.removeTopicIds,
      settings: {
        hideComments: input.hideComments,
        hidePhoneComments: input.hidePhoneComments,
        skipComments: input.skipComments,
      },
      workspaceId,
    }),

  listAuthors: async (workspaceId: string, input: ListAuthorsInput) =>
    await channelPostManagementService.listAuthors({
      channels: input.channels,
      inboxIds: input.inboxIds,
      workspaceId,
    }),

  listComments: async (caller: CommentCaller, input: ListCommentsInput) =>
    await channelPostCommentsService.list({
      canViewEmailAndPhone: caller.canViewEmailAndPhone,
      cursor: input.cursor,
      hasPhone: input.hasPhone,
      limit: input.limit,
      postId: input.id,
      search: input.search,
      workspaceId: caller.workspaceId,
    }),

  mergeComments: async (caller: CommentCaller, input: MergeCommentsInput) =>
    await channelPostCommentsService.mergeView({
      canViewEmailAndPhone: caller.canViewEmailAndPhone,
      cursor: input.cursor,
      hasPhone: input.hasPhone,
      limit: input.limit,
      postIds: input.postIds,
      search: input.search,
      workspaceId: caller.workspaceId,
    }),

  likeComment: async (workspaceId: string, input: LikeCommentInput) =>
    await channelPostCommentsService.like({
      commentId: input.commentId,
      createdAt: input.createdAt,
      liked: input.liked,
      postId: input.id,
      workspaceId,
    }),

  deleteComment: async (workspaceId: string, input: DeleteCommentInput) =>
    await channelPostCommentsService.delete({
      commentId: input.commentId,
      createdAt: input.createdAt,
      postId: input.id,
      workspaceId,
    }),

  /**
   * The one adapter of the public procedure and the download route: the list
   * `sort` travels apart from the filters, and omitted filters stay omitted
   * (the comment kinds refuse any filters).
   */
  exportComments: async (caller: CommentCaller, input: ExportCommentsInput) => {
    const { sort, ...filters } = input.filters ?? {}
    return await channelPostExportService.build({
      canViewEmailAndPhone: caller.canViewEmailAndPhone,
      filters: input.filters ? filters : undefined,
      kind: input.kind,
      postIds: input.postIds,
      search: input.search,
      sort,
      workspaceId: caller.workspaceId,
    })
  },
}
