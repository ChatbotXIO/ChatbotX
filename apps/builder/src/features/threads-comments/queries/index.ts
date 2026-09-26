import { commentAutomationService } from "@chatbotx.io/business"
import { commentAutomationModel } from "@chatbotx.io/database/schema"
import {
  getPaginationWithDefaults,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ListThreadsCommentsRequest,
  ListThreadsCommentsResponse,
} from "../schema/action"
import { threadsCommentResource } from "../schema/resource"

/**
 * Narrows a stored row to the shape Threads actually supports. The one mapper
 * both the list and the get read through, so the two cannot disagree.
 *
 * `includeKeywords` and a text reply's `values` pass through untouched: the
 * edit form writes back whatever it reads, so dropping either here would erase
 * a `mentions` filter or every text after the first on the next save.
 */
const toThreadsResource = (
  record: Awaited<
    ReturnType<typeof commentAutomationService.getThreadsAutomation>
  > &
    object,
) => ({
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

export async function listThreadsComments(
  input: ListThreadsCommentsRequest,
): Promise<ListThreadsCommentsResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const pagination = getPaginationWithDefaults(input)
  const orderBy = parseOrderByAsObject(commentAutomationModel, input)
  const { data, total } = await commentAutomationService.listThreadsAutomations(
    {
      workspaceId: input.workspaceId,
      name: input.name || undefined,
      isActive: input.isActive ?? undefined,
      limit: pagination.limit,
      offset: pagination.offset,
      orderBy,
    },
  )

  return {
    data: threadsCommentResource.array().parse(data.map(toThreadsResource)),
    pageCount: Math.ceil(total / pagination.limit),
  }
}

export async function getThreadsComment(workspaceId: string, id: string) {
  await assertCurrentUserCanAccessChatbot(workspaceId)

  const record = await commentAutomationService.getThreadsAutomation({
    workspaceId,
    id,
  })

  if (!record) {
    throw new Error("Threads Comment Automation not found")
  }

  return threadsCommentResource.parse(toThreadsResource(record))
}
