import { contactNoteService } from "@chatbotx.io/business"
import type { PaginatedResponse } from "@/features/common/schema/pagination"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListContactNotesRequest } from "../schema/query"
import type { ContactNoteResource } from "../schema/resource"

export async function listContactNotes(
  input: ListContactNotesRequest,
): Promise<PaginatedResponse<ContactNoteResource>> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const data = await contactNoteService.listWithAuthor({
    contactId: input.contactId,
  })

  return {
    data,
    pageCount: 1,
  }
}
