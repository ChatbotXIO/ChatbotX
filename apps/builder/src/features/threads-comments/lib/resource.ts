import { commentAutomationService } from "@chatbotx.io/business"
import type { CommentAutomationModel } from "@chatbotx.io/database/types"
import {
  type ThreadsCommentResource,
  threadsCommentResource,
} from "../schema/resource"

/**
 * Narrows a stored row to the shape Threads actually supports. The one mapper
 * the private queries and the public API read through, so they cannot
 * disagree.
 *
 * `includeKeywords` and a text reply's `values` pass through untouched: the
 * edit form writes back whatever it reads, so dropping either here would erase
 * a `mentions` filter or every text after the first on the next save.
 */
export const toThreadsResource = (
  record: CommentAutomationModel,
): ThreadsCommentResource =>
  threadsCommentResource.parse({
    ...record,
    post: {
      type: record.post.type === "postIds" ? "postIds" : "all",
      value: record.post.type === "postIds" ? record.post.value : [],
    },
    privateReply: { type: "none", value: null },
    publicReply:
      record.publicReply.type === "none"
        ? { type: "none", value: null }
        : {
            type: record.publicReply.type,
            value: record.publicReply.value ?? "",
            values: record.publicReply.values,
          },
  })

export async function listThreadsCommentResources(
  input: Parameters<typeof commentAutomationService.listThreadsAutomations>[0],
) {
  const { data, pageCount } =
    await commentAutomationService.listThreadsAutomations(input)
  return { data: data.map(toThreadsResource), pageCount }
}

export async function getThreadsCommentResource(input: {
  workspaceId: string
  id: string
}) {
  return toThreadsResource(
    await commentAutomationService.findThreadsOrFail(input),
  )
}
