import type { DatabaseClient } from "@chatbotx.io/database/client"
import { isPostCommentEventType } from "@chatbotx.io/database/partials"
import { channelPostRepository } from "@chatbotx.io/database/repositories"
import type { ConditionModel } from "@chatbotx.io/database/types"
import { validationException } from "../errors"
import type { ConditionInput } from "./condition-columns"

export const POST_COMMENT_POSTS_INVALID_KEY =
  "validation.trigger.postCommentPostsInvalid"

type NamedPosts = {
  index: number
  inboxId: string | null
  postIds: string[]
}

const postIdsOf = (value: unknown): string[] => {
  if (typeof value !== "object" || value === null) {
    return []
  }
  const { channelPostIds } = value as { channelPostIds?: unknown }
  if (!Array.isArray(channelPostIds)) {
    return []
  }
  return channelPostIds.filter(
    (id): id is string => typeof id === "string" && id !== "",
  )
}

const inboxIdOf = (sourceId: string | null | undefined): string | null =>
  sourceId ? String(sourceId) : null

const sameNamedPosts = (
  stored: ConditionModel,
  inboxId: string | null,
  postIds: string[],
): boolean => {
  const storedIds = postIdsOf(stored.value)
  return (
    inboxIdOf(stored.sourceId) === inboxId &&
    storedIds.length === postIds.length &&
    postIds.every((id) => storedIds.includes(id))
  )
}

/**
 * The posts the post-comment conditions of a save name, left out when a
 * condition keeps the very pair (inbox, posts) it already stores, so a trigger
 * that still names a deleted post can be saved without touching it.
 */
const changedNamedPosts = (
  conditions: readonly ConditionInput[],
  stored: readonly ConditionModel[],
): NamedPosts[] => {
  const storedById = new Map(stored.map((row) => [String(row.id), row]))
  const named: NamedPosts[] = []
  conditions.forEach((condition, index) => {
    if (!isPostCommentEventType(condition.type)) {
      return
    }
    const postIds = postIdsOf(condition.value)
    if (postIds.length === 0) {
      return
    }
    const inboxId = inboxIdOf(condition.sourceId)
    const previous = condition.id ? storedById.get(condition.id) : undefined
    if (previous && sameNamedPosts(previous, inboxId, postIds)) {
      return
    }
    named.push({ index, inboxId, postIds })
  })
  return named
}

/**
 * Rejects a post-comment condition whose `channelPostIds` name a post that is
 * not in the workspace, or (when the condition pins an inbox) not in that
 * inbox: the matcher requires both, so such a condition could never fire. One
 * workspace-scoped read for the whole save, at
 * `conditions.<index>.value.channelPostIds`.
 */
export const assertPostCommentPostsValid = async (input: {
  conditions: readonly ConditionInput[]
  stored: readonly ConditionModel[]
  tx: DatabaseClient
  workspaceId: string
}): Promise<void> => {
  const named = changedNamedPosts(input.conditions, input.stored)
  if (named.length === 0) {
    return
  }
  const rows = await channelPostRepository.findByIds(
    {
      ids: named.flatMap((entry) => entry.postIds),
      workspaceId: input.workspaceId,
    },
    input.tx,
  )
  const inboxByPost = new Map(rows.map((row) => [String(row.id), row.inboxId]))
  for (const entry of named) {
    const invalid = entry.postIds.some((id) => {
      const postInbox = inboxByPost.get(id)
      return (
        postInbox === undefined ||
        (entry.inboxId !== null && String(postInbox) !== entry.inboxId)
      )
    })
    if (invalid) {
      throw validationException(
        `conditions.${entry.index}.value.channelPostIds`,
        POST_COMMENT_POSTS_INVALID_KEY,
      )
    }
  }
}
