import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import {
  getThreadsCommentResource,
  listThreadsCommentResources,
} from "../lib/resource"
import type {
  ListThreadsCommentsRequest,
  ListThreadsCommentsResponse,
} from "../schema/action"

export async function listThreadsComments(
  input: ListThreadsCommentsRequest,
): Promise<ListThreadsCommentsResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  return await listThreadsCommentResources(input)
}

export async function getThreadsComment(workspaceId: string, id: string) {
  await assertCurrentUserCanAccessChatbot(workspaceId)

  return await getThreadsCommentResource({ workspaceId, id })
}
