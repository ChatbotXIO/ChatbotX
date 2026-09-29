import { integrationThreadsService } from "@chatbotx.io/business"
import type { ThreadsAuthValue } from "@chatbotx.io/integration-threads"
import {
  listPostConversation,
  type ThreadsConversationReply,
} from "@chatbotx.io/integration-threads/apis/comment"
import { collectCommentsSince, parseGraphTime, toEpochSeconds } from "./paging"
import {
  MissedCommentsIntegrationNotFoundError,
  type ScanCommentsProps,
  type ScannedComment,
} from "./types"

/**
 * Threads replies (at any depth) under the automation's post, shaped like the
 * `replies` webhook. Each connected account is tried until one owns the post.
 */
export async function scanThreadsComments(
  props: ScanCommentsProps,
): Promise<ScannedComment[]> {
  const { workspaceId, postId, since } = props
  const { data: integrations } =
    await integrationThreadsService.listByWorkspaceId({ workspaceId })

  if (integrations.length === 0) {
    throw new MissedCommentsIntegrationNotFoundError()
  }

  let lastError: unknown
  for (const integration of integrations) {
    const auth = integration.auth as ThreadsAuthValue
    try {
      const replies = await collectCommentsSince<
        ThreadsConversationReply,
        string
      >({
        fetchPage: async (after) => {
          const page = await listPostConversation({ auth, postId, after })
          return { items: page.replies, nextCursor: page.nextCursor }
        },
        createdAtOf: (reply) => parseGraphTime(reply.timestamp),
        since,
        newestFirst: true,
      })
      return toScannedComments({
        replies,
        threadsUserId: integration.threadsUserId,
        ownUsername: auth.metadata.username,
        postId,
      })
    } catch (error) {
      lastError = error
    }
  }

  throw lastError
}

function toScannedComments(props: {
  replies: ThreadsConversationReply[]
  threadsUserId: string
  ownUsername: string
  postId: string
}): ScannedComment[] {
  const { replies, threadsUserId, ownUsername, postId } = props
  return replies.flatMap((reply) => {
    const username = reply.username
    // No author to key a contact by, or the account's own reply.
    if (
      !username ||
      reply.is_reply_owned_by_me === true ||
      username.toLowerCase() === ownUsername.toLowerCase()
    ) {
      return []
    }
    return [
      {
        integrationIdentifier: threadsUserId,
        commentData: {
          commentId: reply.id,
          postId,
          parentId: reply.replied_to?.id,
          // The webhook keys Threads contacts by lowercased username.
          fromId: username.toLowerCase(),
          fromName: username,
          message: reply.text,
          createdTime: toEpochSeconds(parseGraphTime(reply.timestamp)),
        },
      },
    ]
  })
}
