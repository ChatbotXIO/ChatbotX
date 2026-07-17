import type { ListInboxesResponse } from "@chatbotx.io/business"
import { inboxService, type ListInboxesRequest } from "@chatbotx.io/business"

export async function listInboxes(
  input: ListInboxesRequest,
): Promise<ListInboxesResponse> {
  return await inboxService.list(input)
}
