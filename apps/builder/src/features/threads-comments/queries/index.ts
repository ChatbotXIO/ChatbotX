import { fbCommentAutomationService } from "@chatbotx.io/business"
import { fbCommentAutomationModel } from "@chatbotx.io/database/schema"
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

export async function listThreadsComments(
  input: ListThreadsCommentsRequest,
): Promise<ListThreadsCommentsResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const pagination = getPaginationWithDefaults(input)
  const orderBy = parseOrderByAsObject(fbCommentAutomationModel, input)
  const { data, total } =
    await fbCommentAutomationService.listThreadsAutomations({
      workspaceId: input.workspaceId,
      name: input.name || undefined,
      isActive: input.isActive ?? undefined,
      limit: pagination.limit,
      offset: pagination.offset,
      orderBy,
    })

  return {
    data: threadsCommentResource.array().parse(
      data.map((item) => ({
        ...item,
        post: {
          type: item.post.type === "postIds" ? "postIds" : "all",
          value: item.post.type === "postIds" ? item.post.value : [],
        },
        privateReply: { type: "none", value: null },
        publicReply:
          item.publicReply.type === "none"
            ? { type: "none", value: null }
            : {
                type: item.publicReply.type,
                value: item.publicReply.value ?? "",
              },
        includeKeywords: {
          type:
            item.includeKeywords.type === "equal" ||
            item.includeKeywords.type === "contain"
              ? item.includeKeywords.type
              : "all",
          value:
            item.includeKeywords.type === "equal" ||
            item.includeKeywords.type === "contain"
              ? item.includeKeywords.value
              : [],
        },
      })),
    ),
    pageCount: Math.ceil(total / pagination.limit),
  }
}

export async function getThreadsComment(workspaceId: string, id: string) {
  await assertCurrentUserCanAccessChatbot(workspaceId)

  const record = await fbCommentAutomationService.getThreadsAutomation({
    workspaceId,
    id,
  })

  if (!record) {
    throw new Error("Threads Comment Automation not found")
  }

  return threadsCommentResource.parse({
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
}
