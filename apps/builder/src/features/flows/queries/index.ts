import { flowService } from "@chatbotx.io/business"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
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
  return await flowService.list(input)
}

export const findFlow = async (
  input: FindFlowParams,
): Promise<{ data: FlowResource | null }> => {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const targetFlow = await flowService.findById(input)

  return { data: targetFlow }
}

export const ensureAllFlowIdsExists = async (
  workspaceId: string,
  flowIds: string[],
): Promise<void> => {
  await flowService.assertAllExist({ workspaceId, flowIds })
}
