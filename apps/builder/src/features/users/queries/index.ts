import { db } from "@aha.chat/database/client"
import type { UserModel } from "@aha.chat/database/types"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { GetUsersSchema } from "../schemas/get-users-schema"

export async function getAllChatbotMembers(
  input: GetUsersSchema,
): Promise<{ data: UserModel[] }> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const where = {
    chatbotMembers: {
      chatbotId: input.chatbotId,
    },
  }

  const data = await db.query.userModel.findMany({ where })

  return { data }
}
