import { getCurrentUserId } from "@/auth"
import type { GetAiAgentsSchema } from "@/features/integrations/open-ai/schemas/ai-agents.schema"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type AiAgent, type Prisma, prisma } from "@ahachat.ai/database"
import { unstable_cache } from "next/cache"

export async function getAiAgents(
  input: GetAiAgentsSchema,
): Promise<{ data: AiAgent[]; pageCount: number }> {
  const userId = await getCurrentUserId()
  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(
    async () => {
      try {
        const where: Prisma.AiAgentWhereInput = {
          chatbotId: input.chatbotId,
        }

        if (input.name) {
          where.AND = [
            {
              name: {
                contains: input.name,
                mode: "insensitive",
              },
            },
          ]
        }

        const orderBy = input.sort.map((sortItem) => ({
          [sortItem.id]: sortItem.desc ? "desc" : "asc",
        }))

        const [data, total] = await prisma.$transaction([
          prisma.aiAgent.findMany({
            skip: (input.page - 1) * input.perPage,
            take: input.perPage,
            where,
            orderBy,
          }),
          prisma.aiAgent.count({ where }),
        ])

        const pageCount = Math.ceil(total / input.perPage)

        return { data, pageCount }
      } catch (err) {
        return { data: [], pageCount: 0 }
      }
    },
    [JSON.stringify(input)],
    {
      revalidate: 3600,
      tags: [`${userId}#aiAgents`],
    },
  )()
}

export const getAiAgentById = async ({
  id,
}: { id: string }): Promise<{
  data: Record<
    string,
    string | Record<string, string | Record<string, string>[]>
  >
  status: string
}> => {
  return {
    data: {
      id: "816038",
      json_builder: {
        messages: [],
        system: "You are a helpful assistant.",
      },
      name: "11232132",
    },
    status: "ok",
  }
}
