import { prisma } from "@aha.chat/database"
import type { TagModel } from "@aha.chat/database/types"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListContactTagsRequest } from "../schemas/contact-tag"

export async function listContactTags(
  input: ListContactTagsRequest,
): Promise<TagModel[]> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const [data] = await prisma.$transaction([
    prisma.contact.findFirst({
      where: {
        id: input.contactId,
      },
      include: {
        tags: true,
      },
    }),
  ])

  return data?.tags || []
}
