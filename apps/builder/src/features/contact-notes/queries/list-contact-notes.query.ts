import { prisma } from "@aha.chat/database"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListContactNotesRequest } from "../schemas/query"
import type { ContactNoteCollection } from "../schemas/resource"

export async function listContactNotes(
  input: ListContactNotesRequest,
): Promise<ContactNoteCollection> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const [data] = await prisma.$transaction([
    prisma.contactNote.findMany({
      where: {
        contactId: input.contactId,
      },
      include: {
        createdBy: true,
      },
    }),
  ])

  return {
    data: data.filter(
      (note) => note.createdBy !== null,
    ) as ContactNoteCollection["data"],
  }
}
