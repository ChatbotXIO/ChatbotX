import { db } from "@aha.chat/database/client"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ListContactTagsRequest,
  ListContactTagsResponse,
} from "../schemas/contact-tag"

export async function listContactTags(
  input: ListContactTagsRequest,
): Promise<ListContactTagsResponse> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const data = await db.query.tagModel.findMany({
    where: {
      chatbotId: input.chatbotId,
      contactsToTags: {
        contactId: input.contactId,
      },
    },
  })

  return {
    data,
  }
}
