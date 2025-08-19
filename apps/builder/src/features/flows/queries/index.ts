import type { Prisma } from "@aha.chat/database"
import { prisma } from "@aha.chat/database"
import type { FlowModel } from "@aha.chat/database/types"
import { unstable_cache } from "next/cache"
import { getCurrentUserId } from "@/lib/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { FlowException } from "../schemas/exception"
import type {
  FindFlowParams,
  FlowCollection,
  FlowResource,
  ListFlowsParams,
} from "../schemas/get-flows-schema"

export async function getFlows(
  input: ListFlowsParams,
): Promise<FlowCollection> {
  const userId = await getCurrentUserId()

  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(
    async () => {
      const where: Prisma.FlowWhereInput = {
        chatbotId: input.chatbotId,
      }

      if (input.folderId !== undefined) {
        where.folderId =
          input.folderId === null || input.folderId === "0"
            ? null
            : input.folderId
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
        prisma.flow.findMany({
          skip: (input.page - 1) * input.perPage,
          take: input.perPage,
          where,
          orderBy,
          // include: {
          //   _count: {
          //     select: {
          // contacts: true
          // flowVersions: {
          //   where: {
          //     isDraft: true,
          //   },
          // },
          //   },
          // },
          // },
        }),
        prisma.flow.count({ where }),
      ])

      const pageCount = Math.ceil(total / input.perPage)

      return { data, pageCount }
    },
    [JSON.stringify(input)],
    {
      revalidate: 3600,
      tags: [`chatbots:${input.chatbotId}#flows`],
    },
  )()
}

export const findFlow = async (
  input: FindFlowParams,
): Promise<{ data: FlowResource | null }> => {
  const userId = await getCurrentUserId()

  await findChatbotOrFail(userId, input.chatbotId)

  // return await unstable_cache(
  //   async () => {
  const flow = await prisma.flow.findFirst({
    where: {
      ...input,
    },
    include: {
      flowVersions: true,
    },
  })

  return { data: flow }
  //   },
  //   [JSON.stringify(input)],
  //   {
  //     revalidate: 3600,
  //     tags: [`chatbots:${input.chatbotId}#flows:${input.id}`],
  //   },
  // )()
}

export const ensureFlowIdIsExists = async (
  chatbotId: string,
  id: string,
): Promise<FlowModel> => {
  const flow = await prisma.flow.findFirst({
    where: {
      chatbotId,
      id,
    },
  })

  if (!flow) {
    throw new FlowException("Flow does not exists.")
  }

  return flow
}

export const ensureAllFlowIdsExists = async (
  chatbotId: string,
  flowIds: string[],
): Promise<void> => {
  const count = await prisma.flow.count({
    where: {
      chatbotId,
      id: {
        in: flowIds,
      },
    },
  })

  if (count !== flowIds.length) {
    throw new FlowException("Flow does not exists.")
  }
}
