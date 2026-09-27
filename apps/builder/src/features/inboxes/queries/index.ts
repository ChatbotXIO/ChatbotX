import type {
  ListAllConnectedInboxesRequest,
  ListAllConnectedInboxesResponse,
  ListInboxesResponse,
} from "@chatbotx.io/business"
import { inboxService, type ListInboxesRequest } from "@chatbotx.io/business"

export async function listInboxes(
  input: ListInboxesRequest,
): Promise<ListInboxesResponse> {
  return await inboxService.list(input)
}

export async function listAllConnectedInboxes(
  input: ListAllConnectedInboxesRequest,
): Promise<ListAllConnectedInboxesResponse> {
  return await inboxService.listAllConnectedByWorkspace(input)
}
