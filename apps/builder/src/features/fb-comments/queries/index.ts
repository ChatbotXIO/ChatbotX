import { fbCommentAutomationService } from "@chatbotx.io/business"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ListFbCommentsRequest,
  ListFbCommentsResponse,
} from "../schema/action"

export async function listFbComments(
  input: ListFbCommentsRequest,
): Promise<ListFbCommentsResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  return await fbCommentAutomationService.list(input)
}

export async function getFbComment(workspaceId: string, id: string) {
  await assertCurrentUserCanAccessChatbot(workspaceId)

  return await fbCommentAutomationService.findMessengerOrFail({
    workspaceId,
    id,
  })
}
