import type { ListInboxesResponse } from "@chatbotx.io/business"
import { inboxService, type ListInboxesRequest } from "@chatbotx.io/business"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"

export async function listInboxes(
  input: ListInboxesRequest,
): Promise<ListInboxesResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  return inboxService.list(input)
}
