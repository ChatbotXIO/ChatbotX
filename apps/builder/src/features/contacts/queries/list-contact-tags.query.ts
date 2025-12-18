import { prisma } from "@aha.chat/database"
import type { TagModel } from "@aha.chat/database/types"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListContactTagsRequest } from "../schemas/contact-tag"

export async function listContactTags(
  input: ListContactTagsRequest,
): Promise<{ data: TagModel[] }> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const [data] = await prisma.$transaction([
    prisma.tag.findMany({
      where: {
        chatbotId: input.chatbotId,
        contacts: {
          some: {
            id: input.contactId,
          },
        },
      },
    }),
  ])

  return {
    data,
  }
}
