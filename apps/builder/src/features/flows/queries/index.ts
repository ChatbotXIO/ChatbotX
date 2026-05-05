import { notFoundException } from "@chatbotx.io/business/errors"
import { db, relationsFilterToSQL } from "@chatbotx.io/database/client"
import { rootFolderId } from "@chatbotx.io/database/partials"
import { flowModel } from "@chatbotx.io/database/schema"
import {
  parseOrderByAsObject,
  parsePagination,
} from "@chatbotx.io/database/utils"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { filterFlowsByTemplateIds } from "../actions/filter-flow-action"
import type {
  FindFlowParams,
  ListFlowsRequest,
  ListFlowsResponse,
} from "../schemas/query"
import type { FlowResource } from "../schemas/resource"

export const listFlowsRSC = async (
  input: ListFlowsRequest & { workspaceId: string },
) => {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  return listFlows(input)
}

export async function listFlows(
  input: ListFlowsRequest & { workspaceId: string },
): Promise<ListFlowsResponse> {
  const where = {
    workspaceId: input.workspaceId,
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
    active: input.active === null ? undefined : input.active,
  }

  const pagination = parsePagination(input)
  const orderBy = parseOrderByAsObject(flowModel, input)

  let [data, total] = await Promise.all([
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

  if (input.startType === "WA_TM01") {
    if (input.integrationWhatsappId) {
      const templates = await db.query.whatsappMessageTemplateModel.findMany({
        where: { integrationWhatsappId: input.integrationWhatsappId },
        columns: { id: true },
      })
      const templateIds = templates.map((t) => t.id)
      data = filterFlowsByTemplateIds(data, templateIds)
      total = data.length
    } else {
      data = []
      total = 0
    }
  }

  const pageCount = pagination?.limit ? Math.ceil(total / pagination.limit) : 1

  return { data, pageCount, ...pagination }
}

export const findFlow = async (
  input: FindFlowParams,
): Promise<{ data: FlowResource | null }> => {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const targetFlow = await db.query.flowModel.findFirst({
    where: {
      workspaceId: input.workspaceId,
      id: input.id,
    },
    with: {
      flowVersions: true,
    },
  })
  if (!targetFlow) {
    throw notFoundException("Flow does not exists.")
  }

  return { data: targetFlow }
}

export const ensureAllFlowIdsExists = async (
  workspaceId: string,
  flowIds: string[],
): Promise<void> => {
  const rows = await db.query.flowModel.findMany({
    where: {
      workspaceId,
      id: {
        in: flowIds,
      },
    },
    columns: { id: true },
  })
  const count = rows.length

  if (count !== flowIds.length) {
    throw notFoundException("Flow does not exists.")
  }
}
