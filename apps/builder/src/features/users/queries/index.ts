import { getCurrentUserId } from "@/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { prisma } from "@ahachat.ai/database"
import type { Prisma, User } from "@ahachat.ai/database"
import { unstable_cache } from "next/cache"
import type { GetUsersSchema } from "../schemas/get-users-schema"

export async function getUsers(
  input: GetUsersSchema,
): Promise<{ data: User[] }> {
  const userId = await getCurrentUserId()

  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(
    async () => {
      try {
        const where: Prisma.UserWhereInput = {
          chatbotMembers: {
            some: {
              chatbotId: input.chatbotId,
            },
          },
        }

        const data = await prisma.user.findMany({ where })

        return { data }
      } catch (_err) {
        return { data: [] }
      }
    },
    [JSON.stringify(input)],
    {
      revalidate: 3600,
      tags: [`${userId}#users`],
    },
  )()
}
