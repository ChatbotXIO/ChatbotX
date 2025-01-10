import { getCurrentUserId } from "@/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { Prisma, prisma, Team, TeamMember, User } from "@ahachat.ai/database"
import { unstable_cache } from "next/cache"
import { GetInboxTeamMembersSchema, GetInboxTeamsSchema } from "../schemas/get-inbox-teams-schema"

export const getInboxTeams = async (input: GetInboxTeamsSchema): Promise<{ data: Team[] }> => {
  const userId = await getCurrentUserId()

  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(async () => {
    try {
      const data = await prisma.team.findMany({
        where: input,
        orderBy: [{ createdAt: "asc" }],
        include: {
          _count: {
            select: {
              teamMembers: true,
            },
          },
        },
      })

      return { data }
    } catch (err) {
      return { data: [] }
    }
  }, [JSON.stringify(input)], {
    revalidate: 3600,
    tags: [
      `${userId}#teams`,
    ]
  })()
}

export async function getInboxTeamMembers(input: GetInboxTeamMembersSchema): Promise<{ data: TeamMember[], pageCount: number }> {
  const userId = await getCurrentUserId()

  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(async () => {
    try {
      const where: Prisma.TeamMemberWhereInput = {
        chatbotId: input.chatbotId,
        teamId: input.teamId,
      }

      const orderBy = input.sort.map((sortItem) => ({
        [sortItem.id]: sortItem.desc ? "desc" : "asc",
      }));

      const [data, total] = await prisma.$transaction([
        prisma.teamMember.findMany({
          skip: (input.page - 1) * input.perPage,
          take: input.perPage,
          where,
          orderBy,
          include: {
            user: true,
          }
        }),
        prisma.teamMember.count({ where }),
      ])

      const pageCount = Math.ceil(total / input.perPage)

      return { data, pageCount }
    } catch (err) {
      return { data: [], pageCount: 0 }
    }
  }, [JSON.stringify(input)], {
    revalidate: 3600,
    tags: [`${userId}#teamMembers`]
  })()
}


interface GetAllUsersInput {
  chatbotId: string;
}

export async function getAllUsers(input: GetAllUsersInput): Promise<User[]> {
  const { chatbotId } = input;

  try {
    const users = await prisma.user.findMany({
      where: {
        chatbotMembers: {
          some: {
            chatbotId: chatbotId,
          },
        },
      },
    });

    return users;
  } catch (error) {
    console.error("Error fetching users:", error);
    return [];
  }
}
