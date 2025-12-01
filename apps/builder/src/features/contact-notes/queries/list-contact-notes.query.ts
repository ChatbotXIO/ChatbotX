import { prisma } from "@aha.chat/database"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListContactNotesRequest } from "../schemas/list-contact-notes.request"
import type { ContactNoteCollection } from "../schemas/types"

export async function listContactNotes(
  input: ListContactNotesRequest,
): Promise<ContactNoteCollection> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const [data] = await prisma.$transaction([
    prisma.contactNote.findMany({
      where: {
        contactId: input.contactId,
      },
    }),
  ])

  return { data }
}
