import { contactService } from "@chatbotx.io/business"
import { requireContactPermissionScope } from "../permissions"
import type { ListContactsRequest, ListContactsResponse } from "../schema/query"
import { resolveContactAvatars } from "./resolve-contact-avatars"

async function listContactsWithResolvedAvatars(
  input: ListContactsRequest,
  projection?: "table",
): Promise<ListContactsResponse> {
  const scope = await requireContactPermissionScope(input.workspaceId)
  const result = await contactService.list({ ...input, scope, projection })

  return {
    ...result,
    data: await resolveContactAvatars(result.data, input.workspaceId),
  }
}

export async function listContacts(
  input: ListContactsRequest,
): Promise<ListContactsResponse> {
  return await listContactsWithResolvedAvatars(input)
}

export async function listContactsRSC(
  input: ListContactsRequest & { workspaceId: string },
): Promise<ListContactsResponse> {
  return await listContactsWithResolvedAvatars(input, "table")
}

export async function countContacts(
  input: ListContactsRequest,
): Promise<{ total: number }> {
  const scope = await requireContactPermissionScope(input.workspaceId)
  return await contactService.count({ ...input, scope })
}
