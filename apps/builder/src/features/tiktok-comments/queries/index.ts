import { commentAutomationService } from "@chatbotx.io/business"
import { commentAutomationModel } from "@chatbotx.io/database/schema"
import {
  getPaginationWithDefaults,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ListTiktokCommentsRequest,
  ListTiktokCommentsResponse,
} from "../schema/action"
import { tiktokCommentResource } from "./../schema/resource"

/**
 * Narrows a stored row to the shape TikTok actually supports.
 *
 * The row is the shared `CommentAutomation` one, so it can carry values no
 * TikTok automation can act on — a `postIds` variant the picker never writes, a
 * private reply. Normalising here keeps the resource schema honest about what
 * the channel does rather than about what the table can hold.
 */
const toTiktokResource = (
  record: Awaited<
    ReturnType<typeof commentAutomationService.getTiktokAutomation>
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
        },
  includeKeywords: {
    type:
      record.includeKeywords.type === "equal" ||
      record.includeKeywords.type === "contain"
        ? record.includeKeywords.type
        : "all",
    value:
      record.includeKeywords.type === "equal" ||
      record.includeKeywords.type === "contain"
        ? record.includeKeywords.value
        : [],
  },
})

export async function listTiktokComments(
  input: ListTiktokCommentsRequest,
): Promise<ListTiktokCommentsResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const pagination = getPaginationWithDefaults(input)
  const orderBy = parseOrderByAsObject(commentAutomationModel, input)
  const { data, total } = await commentAutomationService.listTiktokAutomations({
    workspaceId: input.workspaceId,
    name: input.name || undefined,
    isActive: input.isActive ?? undefined,
    limit: pagination.limit,
    offset: pagination.offset,
    orderBy,
  })

  return {
    data: tiktokCommentResource.array().parse(data.map(toTiktokResource)),
    pageCount: Math.ceil(total / pagination.limit),
  }
}

export async function getTiktokComment(workspaceId: string, id: string) {
  await assertCurrentUserCanAccessChatbot(workspaceId)

  const record = await commentAutomationService.getTiktokAutomation({
    workspaceId,
    id,
  })

  if (!record) {
    throw new Error("TikTok Comment Automation not found")
  }

  return tiktokCommentResource.parse(toTiktokResource(record))
}
