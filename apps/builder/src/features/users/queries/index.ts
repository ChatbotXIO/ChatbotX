import { type Prisma, prisma } from "@aha.chat/database"
import type { UserModel } from "@aha.chat/database/types"
import { unstable_cache } from "next/cache"
import { getCurrentUserId } from "@/lib/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"
import type { GetUsersSchema } from "../schemas/get-users-schema"

export async function getUsers(
  input: GetUsersSchema,
): Promise<{ data: UserModel[] }> {
  const userId = await getCurrentUserId()

  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(
    async () => {
      const where: Prisma.UserWhereInput = {
        chatbotMembers: {
          some: {
            chatbotId: input.chatbotId,
          },
        },
      }

      const data = await prisma.user.findMany({ where })

      return { data }
    },
    [JSON.stringify(input)],
    {
      revalidate: 3600,
      tags: [`chatbots:${input.chatbotId}#users`],
    },
  )()
}
