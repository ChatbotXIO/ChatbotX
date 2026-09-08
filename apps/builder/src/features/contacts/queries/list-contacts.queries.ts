import { contactService } from "@chatbotx.io/business"
import { requireContactPermissionScope } from "../permissions"
import type { ListContactsRequest, ListContactsResponse } from "../schema/query"

export async function listContacts(
  input: ListContactsRequest,
): Promise<ListContactsResponse> {
  const scope = await requireContactPermissionScope(input.workspaceId)
  return await contactService.list({ ...input, scope })
}

export async function listContactsRSC(
  input: ListContactsRequest & { workspaceId: string },
): Promise<ListContactsResponse> {
  const scope = await requireContactPermissionScope(input.workspaceId)
  return await contactService.list({ ...input, scope, projection: "table" })
}

export async function countContacts(
  input: ListContactsRequest,
): Promise<{ total: number }> {
  const scope = await requireContactPermissionScope(input.workspaceId)
  return await contactService.count({ ...input, scope })
}
