import { commentAutomationService } from "@chatbotx.io/business"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ListIgCommentsRequest,
  ListIgCommentsResponse,
} from "../schema/action"

export async function listIgComments(
  input: ListIgCommentsRequest,
): Promise<ListIgCommentsResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  return await commentAutomationService.listIgComments(input)
}

export async function getIgComment(workspaceId: string, id: string) {
  await assertCurrentUserCanAccessChatbot(workspaceId)

  return await commentAutomationService.findInstagramOrFail({
    workspaceId,
    id,
  })
}
