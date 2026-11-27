import { tiktokIntegrationService } from "@chatbotx.io/business"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import {
  getTiktokCommentResource,
  listTiktokCommentResources,
} from "../lib/resource"
import type {
  ListTiktokCommentsRequest,
  ListTiktokCommentsResponse,
} from "../schema/action"

export async function listTiktokComments(
  input: ListTiktokCommentsRequest,
): Promise<ListTiktokCommentsResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  return await listTiktokCommentResources(input)
}

export async function getTiktokComment(workspaceId: string, id: string) {
  await assertCurrentUserCanAccessChatbot(workspaceId)

  return await getTiktokCommentResource({ workspaceId, id })
}

/**
 * TikTok accounts of the workspace that cannot read video captions, so the
 * form can warn that a `hashtags` automation would skip their comments.
 */
export async function listTiktokInboxIdsWithoutCaptionAccess(
  workspaceId: string,
): Promise<string[]> {
  await assertCurrentUserCanAccessChatbot(workspaceId)

  return await tiktokIntegrationService.listInboxIdsWithoutCaptionAccess({
    workspaceId,
  })
}
