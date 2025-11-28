import { type Prisma, prisma } from "@aha.chat/database"
import type { UserModel } from "@aha.chat/database/types"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { GetUsersSchema } from "../schemas/get-users-schema"

export async function getUsers(
  input: GetUsersSchema,
): Promise<{ data: UserModel[] }> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const where: Prisma.UserWhereInput = {
    chatbotMembers: {
      some: {
        chatbotId: input.chatbotId,
      },
    },
  }

  const data = await prisma.user.findMany({ where })

  return { data }
}
