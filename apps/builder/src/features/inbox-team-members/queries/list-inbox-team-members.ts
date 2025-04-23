import { getCurrentUserId } from "@/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { prisma } from "@ahachat.ai/database"
import { unstable_cache } from "next/cache"
import type { ListInboxTeamMemberRequest } from "../schemas/list-inbox-team-member"
import type { InboxTeamMemberCollection } from "../schemas/types"

export async function getInboxTeamMembers(
  input: ListInboxTeamMemberRequest,
): Promise<InboxTeamMemberCollection> {
  const userId = await getCurrentUserId()
  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(
    async () => {
      try {
        const data = await prisma.inboxTeamMember.findMany({
          where: input,
        })

        return { data }
      } catch (_err) {
        return { data: [] }
      }
    },
    [JSON.stringify(input)],
    {
      revalidate: 3600,
      tags: [`chatbots:${input.chatbotId}#inboxTeamMembers`],
    },
  )()
}
