import { db } from "@aha.chat/database/client"
import type { PaginatedResponse } from "@/features/common/schemas/pagination"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListContactNotesRequest } from "../schemas/query"
import type { ContactNoteResource } from "../schemas/resource"

export async function listContactNotes(
  input: ListContactNotesRequest,
): Promise<PaginatedResponse<ContactNoteResource>> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const data = await db.query.contactNoteModel.findMany({
    where: {
      contactId: input.contactId,
      createdById: {
        isNotNull: true,
      },
    },
    with: {
      createdBy: true,
    },
  })

  return {
    data,
    pageCount: 1,
  }
}
