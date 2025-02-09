import { getCurrentUserId } from "@/auth"
import type { GetCurrentFlowSchema } from "@/features/flows/schemas/get-flows-schema"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type Flow, prisma } from "@ahachat.ai/database"
import type { FlowVersion, Folder, Prisma } from "@ahachat.ai/database"
import { unstable_cache } from "next/cache"
import type { GetFlowsSchema } from "../schemas/get-flows-schema"

export async function getFlows(
  input: GetFlowsSchema,
): Promise<{ data: Flow[]; pageCount: number }> {
  const userId = await getCurrentUserId()

  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(
    async () => {
      try {
        const where: Prisma.FlowWhereInput = {
          chatbotId: input.chatbotId,
        }

        if (input.folderId !== undefined) {
          where.folderId =
            input.folderId === null || input.folderId === "0"
              ? null
              : input.folderId
        }

        if (input.title) {
          where.AND = [
            {
              title: {
                contains: input.title,
                mode: "insensitive",
              },
            },
          ]
        }

        const orderBy = input.sort.map((sortItem) => ({
          [sortItem.id]: sortItem.desc ? "desc" : "asc",
        }))

        const [data, total] = await prisma.$transaction([
          prisma.flow.findMany({
            skip: (input.page - 1) * input.perPage,
            take: input.perPage,
            where,
            orderBy,
            include: {
              _count: {
                select: {
                  flowVersions: {
                    where: {
                      isDraft: true,
                    },
                  },
                },
              },
            },
          }),
          prisma.flow.count({ where }),
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
      tags: [`${userId}#flows`],
    },
  )()
}

type CurrentFlowResource = Flow & {
  folder: Folder | null
  currentVersion: FlowVersion | null
  flowVersions: FlowVersion[]
}

export const getCurrentFlow = async (
  input: GetCurrentFlowSchema,
): Promise<{ flow: CurrentFlowResource }> => {
  const userId = await getCurrentUserId()

  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(
    async () => {
      const flow = await prisma.flow.findFirstOrThrow({
        where: {
          ...input,
        },
        include: {
          folder: true,
          currentVersion: true,
          flowVersions: {
            where: {
              isDraft: true,
            },
          },
        },
      })

      return { flow }
    },
    [JSON.stringify(input)],
    {
      revalidate: 3600,
      tags: [`${userId}#flows`, `${userId}#flows#${input.id}`],
    },
  )()
}
