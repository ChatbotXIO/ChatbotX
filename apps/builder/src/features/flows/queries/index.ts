import { db, relationsFilterToSQL } from "@aha.chat/database/client"
import { rootFolderId } from "@aha.chat/database/enums"
import { flowModel } from "@aha.chat/database/schema"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { parseOrderByAsObject, parsePagination } from "@/lib/pagination"
import { FlowException } from "../schemas/exception"
import type {
  FindFlowParams,
  ListFlowsRequest,
  ListFlowsResponse,
} from "../schemas/query"
import type { FlowResource } from "../schemas/resource"

export const listFlowsRSC = async (
  input: ListFlowsRequest & { chatbotId: string },
) => {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  return listFlows(input)
}

export async function listFlows(
  input: ListFlowsRequest & { chatbotId: string },
): Promise<ListFlowsResponse> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const where = {
    chatbotId: input.chatbotId,
    folderId: input.folderId
      ? // biome-ignore lint/style/noNestedTernary: allow nested ternary
        input.folderId === rootFolderId
        ? { isNull: true as const }
        : input.folderId
      : undefined,
    name: input.name
      ? {
          ilike: `%${input.name.toLowerCase()}%`,
        }
      : undefined,
    active: input.active !== null ? input.active : undefined,
  }

  const pagination = parsePagination(input)
  const orderBy = parseOrderByAsObject(flowModel, input)

  const [data, total] = await Promise.all([
    db.query.flowModel.findMany({
      where,
      orderBy,
      ...pagination,
      with: {
        flowVersions: {
          where: {
            OR: [
              { isDraft: true },
              {
                isLatest: true,
              },
            ],
          },
        },
      },
    }),
    db.$count(flowModel, relationsFilterToSQL(flowModel, where)),
  ])

  const pageCount = pagination?.limit ? Math.ceil(total / pagination.limit) : 1

  return { data, pageCount, ...pagination }
}

export const findFlow = async (
  input: FindFlowParams,
): Promise<{ data: FlowResource | null }> => {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const targetFlow = await db.query.flowModel.findFirst({
    where: {
      chatbotId: input.chatbotId,
      id: input.id,
    },
    with: {
      flowVersions: true,
    },
  })
  if (!targetFlow) {
    throw new FlowException("Flow does not exists.")
  }

  return { data: targetFlow }
}

export const ensureAllFlowIdsExists = async (
  chatbotId: string,
  flowIds: string[],
): Promise<void> => {
  const rows = await db.query.flowModel.findMany({
    where: {
      chatbotId,
      id: {
        in: flowIds,
      },
    },
    columns: { id: true },
  })
  const count = rows.length

  if (count !== flowIds.length) {
    throw new FlowException("Flow does not exists.")
  }
}
