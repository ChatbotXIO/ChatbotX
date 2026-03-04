import { db } from "@aha.chat/database/client"
import type { TagModel } from "@aha.chat/database/types"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListContactTagsRequest } from "../schemas/contact-tag"

export async function listContactTags(
  input: ListContactTagsRequest,
): Promise<{ data: TagModel[] }> {
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
