import { commentAutomationService } from "@chatbotx.io/business"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ListFbCommentsRequest,
  ListFbCommentsResponse,
} from "../schema/action"

export async function listFbComments(
  input: ListFbCommentsRequest,
): Promise<ListFbCommentsResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  return await commentAutomationService.list(input)
}

export async function getFbComment(workspaceId: string, id: string) {
  await assertCurrentUserCanAccessChatbot(workspaceId)

  return await commentAutomationService.findMessengerOrFail({
    workspaceId,
    id,
  })
}
