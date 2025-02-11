import { getCurrentUserId } from "@/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { unstable_cache } from "next/cache"

export const getFlows = async (
  input: Record<string, string>,
): Promise<{
  data: Record<string, string>[]
  pageCount: number
}> => {
  const userId = await getCurrentUserId()
  await findChatbotOrFail(userId, input.chatbotId as string)

  return await unstable_cache(
    async () => {
      try {
        return { data: [], pageCount: 1 }
      } catch (err) {
        return { data: [], pageCount: 0 }
      }
    },
    [JSON.stringify(input)],
    {
      revalidate: 3600,
      tags: [`${userId}#flows`],
    },
  )()
}
