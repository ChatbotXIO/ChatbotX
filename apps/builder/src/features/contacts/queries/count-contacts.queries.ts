import { prisma } from "@aha.chat/database"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"

export async function getTotalContacts(
  chatbotId: string,
): Promise<{ total: number }> {
  await assertCurrentUserCanAccessChatbot(chatbotId)

  const total = await prisma.contact.count({
    where: {
      chatbotId,
    },
  })

  return { total }
}
