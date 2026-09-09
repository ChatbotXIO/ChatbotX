import { sequenceService } from "@chatbotx.io/business/sequence"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ListSequencesRequest,
  ListSequencesResponse,
} from "../schema/action"

export async function listSequences(
  input: ListSequencesRequest,
): Promise<ListSequencesResponse> {
  return await sequenceService.list(input)
}

export async function getSequence(workspaceId: string, sequenceId: string) {
  await assertCurrentUserCanAccessChatbot(workspaceId)

  return await sequenceService.findWithSteps({
    workspaceId,
    id: sequenceId,
  })
}
