import { db, eq } from "@aha.chat/database/client"
import { contactModel } from "@aha.chat/database/schema"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"

export async function getContactCounts(
  chatbotId: string,
): Promise<{ total: number }> {
  await assertCurrentUserCanAccessChatbot(chatbotId)

  const total = await db.$count(
    contactModel,
    eq(contactModel.chatbotId, chatbotId),
  )

  return { total }
}
