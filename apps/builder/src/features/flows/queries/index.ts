import type { Prisma } from "@aha.chat/database"
import { prisma } from "@aha.chat/database"
import { rootFolderId } from "@aha.chat/database/enums"
import type { FlowModel } from "@aha.chat/database/types"
import type { PaginatedResponse } from "@/features/common/schemas/pagination"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { FlowException } from "../schemas/exception"
import type { FindFlowParams, ListFlowsParams } from "../schemas/query"
import type { FlowResource } from "../schemas/resource"

export async function getFlows(
  input: ListFlowsParams,
): Promise<PaginatedResponse<FlowResource>> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const where: Prisma.FlowWhereInput = {
    chatbotId: input.chatbotId,
  }

  if (input.folderId) {
    where.folderId = input.folderId === rootFolderId ? null : input.folderId
  }

  if (input.name) {
    where.name = {
      contains: input.name,
      mode: "insensitive",
    }
  }

  if (input.active) {
    where.active = input.active
  }

  const orderBy = input.sort
    ? input.sort.map((sortItem) => ({
        [sortItem.id]: sortItem.desc ? "desc" : "asc",
      }))
    : [{ updatedAt: "desc" }]

  const [data, total] = await prisma.$transaction(async (tx) => {
    const flows = await tx.flow.findMany({
      skip: (input.page - 1) * input.perPage,
      take: input.perPage,
      where,
      orderBy,
    })

    const count = await tx.flow.count({ where })

    return [flows, count]
  })

  const pageCount = Math.ceil(total / input.perPage)

  return { data, pageCount }
}

export const findFlow = async (
  input: FindFlowParams,
): Promise<{ data: FlowResource | null }> => {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const flow = await prisma.flow.findFirst({
    where: {
      ...input,
    },
    include: {
      flowVersions: true,
    },
  })

  return { data: flow }
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
