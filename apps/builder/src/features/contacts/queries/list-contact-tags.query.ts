import { db } from "@chatbotx.io/database/client"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ListContactTagsRequest,
  ListContactTagsResponse,
} from "../schemas/contact-tag"

export async function listContactTags(
  input: ListContactTagsRequest,
): Promise<ListContactTagsResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const data = await db.query.tagModel.findMany({
    where: {
      workspaceId: input.workspaceId,
      contactsToTags: {
        contactId: input.contactId,
      },
    },
  })

  return {
    data,
  }
}
