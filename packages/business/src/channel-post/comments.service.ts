import type { ChannelType } from "@chatbotx.io/database/partials"
import {
  channelPostRepository,
  createMessageRepository,
  type ListedComment,
  MAX_COMMENT_THREADS_PER_READ,
  type PostCommenter,
  postCommentRepository,
} from "@chatbotx.io/database/repositories"
import {
  RealtimeEventType,
  routeForConversation,
} from "@chatbotx.io/realtime-protocol"
import {
  isPostManagementChannel,
  POST_CHANNEL_CAPABILITIES,
} from "@chatbotx.io/utils/channel"
import { redactPhoneNumbers } from "@chatbotx.io/utils/has-phone-number"
import { ChatJobAction, chatQueue } from "@chatbotx.io/worker-config"
import { BaseService } from "../base.service"
import { contactInboxService } from "../contact-inbox/service"
import { conversationService } from "../conversation/service"
import {
  conflictException,
  notFoundException,
  validationException,
} from "../errors"
import { messageService } from "../message/service"
import { queueWorkspaceRealtimeEvent } from "../platform/realtime-broadcast"
import { commentLikeFence } from "./comment-like-fence"

/** Most posts one merged comment view reads. */
export const MAX_MERGE_VIEW_POSTS = 20
/** Largest page of comments one read returns. */
export const MAX_COMMENTS_PAGE_SIZE = 100

/** Error code of a comment action the post's channel cannot perform. */
export const COMMENT_ACTION_UNSUPPORTED_CODE = "commentActionUnsupported"

/**
 * Where a comment page stopped. `createdAt` is the exact PostgreSQL instant
 * (microseconds, with offset) of the last comment returned; `shardId` names
 * the message shard the next page resumes in.
 */
export type PostCommentCursor = {
  createdAt: string
  id: string
  shardId?: string
}

export type PostCommentAuthor = {
  avatar: string | null
  id: string
  name: string | null
  /** `null` when the caller may not view phone numbers, or the contact has none. */
  phoneNumber: string | null
  tags: { id: string; name: string }[]
}

export type PostCommentItem = {
  /** The commenter. `null` only if the contact was deleted after commenting. */
  author: PostCommentAuthor | null
  /** The channel's own id of the comment. */
  commentId: string | null
  createdAt: Date
  /** `true` when the comment is hidden on the channel. */
  hidden: boolean
  /** The comment's id; pass it to like / delete. */
  id: string
  liked: boolean
  /**
   * The `id` of the comment this one replies to (the parent's own message id,
   * the `id` that parent has in this list), if it is a reply.
   */
  parentCommentId: string | null
  /** The post (`ChannelPost.id`) the comment belongs to. */
  postId: string
  /** Comment text; any phone number in it is masked for a caller who may not view them. */
  text: string | null
}

export type PostCommentsPage = {
  /** `true` when a message shard failed to answer, so the page may miss comments. */
  hasPartialResults?: boolean
  items: PostCommentItem[]
  nextCursor?: PostCommentCursor
}

export const PHONE_DATA_UNAVAILABLE_MESSAGE =
  "Phone numbers are not available to this caller."

type ReaderInput = {
  /**
   * May the caller see phone numbers? Without it the phone filter is refused and
   * a text search runs over the text as that caller sees it, numbers masked.
   */
  canViewEmailAndPhone: boolean
  /** Only comments that carry a phone number. */
  hasPhone?: boolean
  postIds: string[]
  /** Only comments whose text contains this, ignoring case. */
  search?: string
  workspaceId: string
}

type ReadPageInput = {
  cursor?: PostCommentCursor
  limit: number
}

type ListCommentsInput = Omit<ReaderInput, "postIds"> &
  ReadPageInput & { postId: string }

type MergeCommentsInput = ReaderInput & ReadPageInput

/**
 * One comment read over a fixed set of posts: the posts and their threads are
 * resolved once when it is opened, so reading further pages (the comments
 * window scrolling, an export) only runs the message query and, for the page's
 * own commenters, one lookup.
 */
export type CommentReader = {
  /**
   * How many comments of these posts carry a phone number, stopping at `limit`
   * (`capped`: the count is then only that lower bound).
   */
  countPhoneComments: (
    limit: number,
  ) => Promise<{ capped: boolean; count: number }>
  /** The posts being read, with the caption a file labels them by. */
  posts: { caption: string | null; externalPostId: string; id: string }[]
  /** Looks up every commenter once; later pages then reuse them (an export reads many pages). */
  preloadCommenters: () => Promise<void>
  readPage: (input: ReadPageInput) => Promise<PostCommentsPage>
  /**
   * The thread lookup stopped at its cap, so comments of commenters beyond it
   * are never read: whatever is built from this reader is incomplete.
   */
  threadsCapped: boolean
}

type PostRef = {
  caption: string | null
  channel: string
  externalPostId: string
  id: string
  inboxId: string
}

const postKey = (post: { externalPostId: string; inboxId: string }): string =>
  `${post.externalPostId}:${post.inboxId}`

const toDatabaseCursor = (cursor: PostCommentCursor) => ({
  createdAt: new Date(cursor.createdAt),
  createdAtText: cursor.createdAt,
  id: cursor.id,
  shardId: cursor.shardId,
})

const likedAndHidden = (
  comment: ListedComment,
): { hidden: boolean; liked: boolean } => {
  const attributes = comment.attributes
  return {
    hidden: attributes?.hidden === true,
    liked: attributes?.liked === true,
  }
}

const unique = <Value>(values: Value[]): Value[] => Array.from(new Set(values))

type PostThread = Awaited<
  ReturnType<typeof postCommentRepository.findThreads>
>[number]
type PostContactInbox = Awaited<
  ReturnType<typeof postCommentRepository.findContactInboxes>
>[number]

/** What one opened reader resolves once and every page read reuses. */
type ReaderScope = {
  contactInboxById: Map<string, PostContactInbox>
  filter: {
    contactInboxIds: string[]
    conversationIds: string[]
    hasPhone: boolean | undefined
    redactPhones: boolean
    search: string | undefined
  }
  /** No thread or no contact inbox: there is nothing to read. */
  isEmpty: boolean
  postByKey: Map<string, PostRef>
  posts: PostRef[]
  threadByConversation: Map<string, PostThread>
  threads: PostThread[]
  threadsCapped: boolean
}

const findCommenters = async (
  workspaceId: string,
  contactIds: string[],
): Promise<Map<string, PostCommenter>> => {
  const commenters = await postCommentRepository.findCommenters({
    contactIds: unique(contactIds),
    workspaceId,
  })
  return new Map(commenters.map((commenter) => [commenter.id, commenter]))
}

const toAuthor = (
  commenter: PostCommenter | undefined,
  canViewEmailAndPhone: boolean,
): PostCommentAuthor | null => {
  if (!commenter) {
    return null
  }
  return {
    avatar: commenter.avatar,
    id: commenter.id,
    name: commenter.name,
    phoneNumber: canViewEmailAndPhone ? commenter.phoneNumber : null,
    tags: commenter.tags,
  }
}

/** `null` for a comment whose thread or post is not part of this reader. */
const toCommentItem = (
  comment: ListedComment,
  scope: ReaderScope,
  commenterById: Map<string, PostCommenter>,
  canViewEmailAndPhone: boolean,
): PostCommentItem | null => {
  const thread = scope.threadByConversation.get(comment.conversationId)
  const contactInbox = scope.contactInboxById.get(comment.contactInboxId)
  if (!(thread && contactInbox)) {
    return null
  }
  const post = scope.postByKey.get(
    postKey({
      externalPostId: thread.postExternalId,
      inboxId: contactInbox.inboxId,
    }),
  )
  if (!post) {
    return null
  }
  return {
    author: toAuthor(commenterById.get(thread.contactId), canViewEmailAndPhone),
    commentId: comment.sourceId,
    createdAt: comment.createdAt,
    id: comment.id,
    parentCommentId: comment.parentId,
    postId: post.id,
    text:
      comment.text !== null && !canViewEmailAndPhone
        ? redactPhoneNumbers(comment.text)
        : comment.text,
    ...likedAndHidden(comment),
  }
}

class ChannelPostCommentsService extends BaseService {
  /** The comments of one post, newest first. */
  async list(input: ListCommentsInput): Promise<PostCommentsPage> {
    const { cursor, limit, postId, ...reader } = input
    const opened = await this.openReader({ ...reader, postIds: [postId] })
    return await opened.readPage({ cursor, limit })
  }

  /**
   * The comments of several posts merged into one newest-first list, each
   * comment tagged with its post.
   */
  async mergeView(input: MergeCommentsInput): Promise<PostCommentsPage> {
    const { cursor, limit, ...reader } = input
    const opened = await this.openReader(reader)
    return await opened.readPage({ cursor, limit })
  }

  /**
   * Opens a reader over 1–{@link MAX_MERGE_VIEW_POSTS} posts: checks the caller
   * may use the filters, finds the posts (not found if one is missing) and their
   * comment threads once. Exports page through it.
   */
  async openReader(input: ReaderInput): Promise<CommentReader> {
    const postIds = unique(input.postIds)
    if (postIds.length === 0 || postIds.length > MAX_MERGE_VIEW_POSTS) {
      throw validationException(
        "postIds",
        `Read between 1 and ${MAX_MERGE_VIEW_POSTS} posts.`,
      )
    }
    if (!input.canViewEmailAndPhone && input.hasPhone) {
      throw validationException("hasPhone", PHONE_DATA_UNAVAILABLE_MESSAGE)
    }

    const scope = await this.loadReaderScope(input, postIds)
    const { canViewEmailAndPhone, workspaceId } = input
    let preloaded: Map<string, PostCommenter> | null = null

    return {
      countPhoneComments: async (limit) => {
        // The thread lookup stops at its cap, so a count over those threads is
        // only a lower bound for a post with more commenters than that: report
        // it as capped even when the message count itself is not.
        if (scope.threadsCapped) {
          return { capped: true, count: 0 }
        }
        if (scope.isEmpty) {
          return { capped: false, count: 0 }
        }
        const repository = await createMessageRepository()
        return await repository.countComments({
          filter: {
            ...scope.filter,
            hasPhone: true,
            redactPhones: false,
            search: undefined,
          },
          limit,
          workspaceId,
        })
      },
      posts: scope.posts,
      preloadCommenters: async () => {
        preloaded = await findCommenters(
          workspaceId,
          scope.threads.map((thread) => thread.contactId),
        )
      },
      readPage: async ({ cursor, limit }) => {
        if (scope.isEmpty) {
          return { items: [] }
        }
        const repository = await createMessageRepository()
        const page = await repository.listComments({
          filter: scope.filter,
          pagination: {
            cursor: cursor ? toDatabaseCursor(cursor) : undefined,
            limit: Math.min(Math.max(limit, 1), MAX_COMMENTS_PAGE_SIZE),
          },
          workspaceId,
        })

        // Only the commenters of this page: never the whole thread list.
        const commenterById =
          preloaded ??
          (await findCommenters(
            workspaceId,
            page.data.flatMap((comment) => {
              const thread = scope.threadByConversation.get(
                comment.conversationId,
              )
              return thread ? [thread.contactId] : []
            }),
          ))

        const items = page.data.flatMap((comment) => {
          const item = toCommentItem(
            comment,
            scope,
            commenterById,
            canViewEmailAndPhone,
          )
          return item ? [item] : []
        })

        const next = page.nextCursor
        const nextCursor =
          next?.createdAtText === undefined
            ? undefined
            : {
                createdAt: next.createdAtText,
                id: next.id,
                shardId: next.shardId,
              }
        return {
          items,
          nextCursor,
          ...(page.hasPartialResults && { hasPartialResults: true }),
        }
      },
      threadsCapped: scope.threadsCapped,
    }
  }

  /** The posts, their comment threads and the message filter every read of one reader shares. */
  private async loadReaderScope(
    input: ReaderInput,
    postIds: string[],
  ): Promise<ReaderScope> {
    const posts = await this.requirePosts(input.workspaceId, postIds)
    const threads = await postCommentRepository.findThreads({
      posts: posts.map((post) => ({
        externalPostId: post.externalPostId,
        inboxId: post.inboxId,
      })),
      workspaceId: input.workspaceId,
    })
    // How each commenter reaches the posts' inboxes: a comment is read only
    // where its contact inbox is one of these, and belongs to the post of that
    // contact inbox's inbox, so a contact merged across inboxes never mixes them.
    const contactInboxes = await postCommentRepository.findContactInboxes({
      contactIds: unique(threads.map((thread) => thread.contactId)),
      inboxIds: unique(posts.map((post) => post.inboxId)),
    })
    const threadByConversation = new Map(
      threads.map((thread) => [thread.id, thread]),
    )
    const contactInboxById = new Map(
      contactInboxes.map((contactInbox) => [contactInbox.id, contactInbox]),
    )
    const conversationIds = Array.from(threadByConversation.keys())
    const contactInboxIds = Array.from(contactInboxById.keys())

    return {
      contactInboxById,
      filter: {
        contactInboxIds,
        conversationIds,
        hasPhone: input.hasPhone || undefined,
        redactPhones: !input.canViewEmailAndPhone,
        search: input.search,
      },
      isEmpty: conversationIds.length === 0 || contactInboxIds.length === 0,
      postByKey: new Map(posts.map((post) => [postKey(post), post])),
      posts,
      threadByConversation,
      threads,
      // At the cap there may be more threads than were returned.
      threadsCapped: threads.length >= MAX_COMMENT_THREADS_PER_READ,
    }
  }

  /**
   * How many comments of one post carry a phone number, stopping at `limit`
   * (`capped`). For repairing the post's stored phone-comment count.
   */
  async countPhoneComments(input: {
    limit: number
    postId: string
    workspaceId: string
  }): Promise<{ capped: boolean; count: number }> {
    const reader = await this.openReader({
      canViewEmailAndPhone: true,
      postIds: [input.postId],
      workspaceId: input.workspaceId,
    })
    return await reader.countPhoneComments(input.limit)
  }

  /** Like or unlike a comment on its channel. */
  async like(input: {
    commentId: string
    createdAt: Date
    liked: boolean
    postId: string
    workspaceId: string
  }): Promise<{ liked: boolean }> {
    const target = await this.resolveComment(input)
    this.assertSupported(target.post, "commentLike", "like")

    const likeSeq = await commentLikeFence.next({
      commentId: target.message.id,
      workspaceId: input.workspaceId,
    })
    await chatQueue.add(ChatJobAction.changeChannelMessageState, {
      type: ChatJobAction.changeChannelMessageState,
      data: {
        contactInbox: target.contactInbox,
        conversation: target.conversation,
        liked: input.liked,
        likeSeq,
        message: { createdAt: target.message.createdAt, id: target.message.id },
      },
    })
    return { liked: input.liked }
  }

  /**
   * Removes a comment from the channel (background job) and from the inbox. The
   * channel job is queued first, with a fixed job id so a retry does not queue a
   * second one: if the queue is down the call fails and the comment stays, rather
   * than disappearing from the inbox while still public on the channel.
   */
  async delete(input: {
    commentId: string
    createdAt: Date
    postId: string
    workspaceId: string
  }): Promise<{ deletedMessageIds: string[] }> {
    const target = await this.resolveComment(input)
    this.assertSupported(target.post, "commentDelete", "delete")

    await chatQueue.add(
      ChatJobAction.deleteChannelMessage,
      {
        type: ChatJobAction.deleteChannelMessage,
        data: {
          contactInbox: target.contactInbox,
          conversation: target.conversation,
          message: {
            createdAt: target.message.createdAt,
            id: target.message.id,
          },
        },
      },
      { jobId: `delete-comment-${target.message.id}` },
    )

    const deleted = await messageService.delete({
      createdAt: target.message.createdAt,
      id: target.message.id,
      sourceId: target.message.sourceId ?? undefined,
      workspaceId: input.workspaceId,
    })
    const deletedMessageIds = deleted.map((row) => row.id)

    await queueWorkspaceRealtimeEvent(input.workspaceId, {
      data: { messageIds: deletedMessageIds },
      eventType: RealtimeEventType.messageDeleted,
      route: routeForConversation(target.conversation),
    })
    return { deletedMessageIds }
  }

  private async requirePosts(
    workspaceId: string,
    postIds: string[],
  ): Promise<PostRef[]> {
    const posts = await channelPostRepository.findByIds({
      ids: postIds,
      workspaceId,
    })
    if (posts.length !== new Set(postIds).size) {
      throw notFoundException("Post not found")
    }
    return posts
  }

  private async resolveComment(input: {
    commentId: string
    createdAt: Date
    postId: string
    workspaceId: string
  }) {
    const [post] = await this.requirePosts(input.workspaceId, [input.postId])
    if (!post) {
      throw notFoundException("Post not found")
    }
    const message = await messageService.findWithAttachments({
      createdAt: input.createdAt,
      id: input.commentId,
      workspaceId: input.workspaceId,
    })
    if (message?.type !== "comment" || message.deletedAt) {
      throw notFoundException("Comment not found")
    }
    const conversation = await conversationService.findByOrFail({
      where: { id: message.conversationId, workspaceId: input.workspaceId },
    })
    // The comment must sit in one of this post's threads.
    if (conversation.sourceId !== post.externalPostId) {
      throw notFoundException("Comment not found")
    }
    const contactInbox = await contactInboxService.findByIdForWorkspace({
      id: message.contactInboxId,
      workspaceId: input.workspaceId,
    })
    // …and in the post's own inbox: another inbox's post can share the external id.
    if (!contactInbox || contactInbox.inboxId !== post.inboxId) {
      throw notFoundException("Comment not found")
    }
    return { contactInbox, conversation, message, post }
  }

  private assertSupported(
    post: PostRef,
    capability: "commentDelete" | "commentLike",
    verb: string,
  ): void {
    const channel = post.channel as ChannelType
    if (
      !(
        isPostManagementChannel(channel) &&
        POST_CHANNEL_CAPABILITIES[channel][capability]
      )
    ) {
      throw conflictException(
        `Comments on this channel cannot be ${verb === "like" ? "liked" : "deleted"} from here.`,
        COMMENT_ACTION_UNSUPPORTED_CODE,
      )
    }
  }
}

export const channelPostCommentsService = new ChannelPostCommentsService()
