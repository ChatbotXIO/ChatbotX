import { db } from "@aha.chat/database/client"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ListContactCustomFieldsRequest,
  ListContactCustomFieldsResponse,
} from "../schemas/contact-custom-field"

export async function listContactCustomFields(
  input: ListContactCustomFieldsRequest,
): Promise<ListContactCustomFieldsResponse> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const data = await db.query.contactCustomFieldModel.findMany({
    where: {
      contactId: input.contactId,
    },
    with: {
      customField: true,
    },
  })

  return {
    data,
  }
}
