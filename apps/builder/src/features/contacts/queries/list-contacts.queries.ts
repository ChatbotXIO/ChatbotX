import { contactService } from "@chatbotx.io/business"
import type { ContactPermissionScope } from "../permissions"
import type {
  ListContactsRequest,
  ListContactsTableResponse,
} from "../schema/query"
import { resolveContactAvatars } from "./resolve-contact-avatars"

export async function listContacts(
  input: ListContactsRequest,
  scope: ContactPermissionScope,
): Promise<ListContactsTableResponse> {
  const result = await contactService.list({
    ...input,
    scope,
    projection: "table",
  })

  return {
    ...result,
    data: await resolveContactAvatars(result.data, input.workspaceId),
  }
}

export async function countContacts(
  input: ListContactsRequest,
  scope: ContactPermissionScope,
): Promise<{ total: number }> {
  return await contactService.count({ ...input, scope })
}
