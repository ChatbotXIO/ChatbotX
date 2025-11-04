import { type Prisma, prisma } from "@aha.chat/database"
import type { UserModel } from "@aha.chat/database/types"
import { unstable_cache } from "next/cache"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { GetUsersSchema } from "../schemas/get-users-schema"

export async function getUsers(
  input: GetUsersSchema,
): Promise<{ data: UserModel[] }> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

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
