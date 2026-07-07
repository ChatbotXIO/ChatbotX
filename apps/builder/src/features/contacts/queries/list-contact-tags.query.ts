import { type ContactAccessScope, contactService } from "@chatbotx.io/business"
import { db } from "@chatbotx.io/database/client"
import type {
  ListContactTagsRequest,
  ListContactTagsResponse,
} from "../schemas/contact-tag"

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

  const data = await db.query.tagModel.findMany({
    where: {
      workspaceId: input.workspaceId,
      deletedAt: { isNull: true as const },
      contactsToTags: {
        contactId: input.contactId,
      },
    },
  })

  return {
    data,
  }
}
