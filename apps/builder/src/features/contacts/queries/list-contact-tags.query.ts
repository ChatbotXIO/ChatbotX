import {
  type ContactAccessScope,
  contactService,
  tagService,
} from "@chatbotx.io/business"
import type {
  ListContactTagsRequest,
  ListContactTagsResponse,
} from "../schema/contact-tag"

export async function listContactTags(
  input: ListContactTagsRequest & { accessScope?: ContactAccessScope },
): Promise<ListContactTagsResponse> {
  if (input.accessScope) {
    await contactService.findByIdOrFail({
      workspaceId: input.workspaceId,
      id: input.contactId,
      accessScope: input.accessScope,
    })
  }

  const data = await tagService.listForContact(input)

  return {
    data,
  }
}
