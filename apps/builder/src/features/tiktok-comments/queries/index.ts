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
