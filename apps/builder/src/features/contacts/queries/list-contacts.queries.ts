import { type CountOutcome, contactService } from "@chatbotx.io/business"
import type { ContactPermissionScope } from "../permissions"
import type {
  CountContactsRequest,
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
  input: CountContactsRequest,
  scope: ContactPermissionScope,
): Promise<CountOutcome> {
  return await contactService.count({ ...input, scope })
}
