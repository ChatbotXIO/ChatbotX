import { savedReplyService } from "@chatbotx.io/business"
import type { ListSavedReplyResponse } from "../schema/mutation"

export async function listSavedReplies(input: {
  workspaceId: string
}): Promise<ListSavedReplyResponse> {
  const data = await savedReplyService.listByWorkspaceId(input.workspaceId)

  return { data }
}
