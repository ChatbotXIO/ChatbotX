import { prisma } from "@aha.chat/database"
import { unstable_cache } from "next/cache"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { calcCacheTags } from "@/lib/cache-helper"
import type { ListContactNotesRequest } from "../schemas/list-contact-notes.request"
import type { ContactNoteCollection } from "../schemas/types"

export async function listContactNotes(
  input: ListContactNotesRequest,
): Promise<ContactNoteCollection> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  return await unstable_cache(
    async () => {
      const [data] = await prisma.$transaction([
        prisma.contactNote.findMany({
          where: {
            contactId: input.contactId,
          },
        }),
      ])

      return { data }
    },
    [JSON.stringify(input)],
    calcCacheTags([`chatbots:${input.chatbotId}#contactNotes`]),
  )()
}
