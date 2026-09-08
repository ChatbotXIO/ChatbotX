import type { ListInboxesResponse } from "@chatbotx.io/business"
import { inboxService, type ListInboxesInput } from "@chatbotx.io/business"

export async function listInboxes(
  input: ListInboxesInput,
): Promise<ListInboxesResponse> {
  return await inboxService.list(input)
}
