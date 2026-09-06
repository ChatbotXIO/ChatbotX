import { flowService } from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import {
  flowRepository,
  whatsappMessageTemplateRepository,
} from "@chatbotx.io/database/repositories"
import { parsePagination } from "@chatbotx.io/database/utils"
import { stepTypes } from "@chatbotx.io/flow-config"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import {
  filterFlowsByStartStepType,
  filterFlowsByTemplateIds,
} from "../actions/filter-flow-action"
import type {
  FindFlowParams,
  ListFlowsRequest,
  ListFlowsResponse,
} from "../schema/query"
import type { FlowResource } from "../schema/resource"

export const listFlowsRSC = async (
  input: ListFlowsRequest & { workspaceId: string },
) => {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  return listFlows(input)
}

export async function listFlows(
  input: ListFlowsRequest & { workspaceId: string },
): Promise<ListFlowsResponse> {
  const pagination = parsePagination(input)

  let [data, total] = await Promise.all([
    flowRepository.listWithVersions(input),
    flowRepository.count(input),
  ])

  if (input.startType) {
    data = filterFlowsByStartStepType(data, input.startType)

    if (input.startType === stepTypes.enum.sendWaTemplateMessage) {
      if (input.integrationWhatsappId) {
        const templateIds =
          await whatsappMessageTemplateRepository.listIdsByIntegration({
            integrationWhatsappId: input.integrationWhatsappId,
          })
        data = filterFlowsByTemplateIds(data, templateIds)
      } else {
        data = []
      }
    }

    total = data.length
  }

  const pageCount = pagination?.limit ? Math.ceil(total / pagination.limit) : 1

  return { data, pageCount, ...pagination }
}

export const findFlow = async (
  input: FindFlowParams,
): Promise<{ data: FlowResource | null }> => {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const targetFlow = await flowRepository.findWithVersions(input)
  if (!targetFlow) {
    throw notFoundException("Flow does not exists.")
  }

  return { data: targetFlow }
}

export const ensureAllFlowIdsExists = async (
  workspaceId: string,
  flowIds: string[],
): Promise<void> => {
  await flowService.assertAllExist({ workspaceId, flowIds })
}
