import { notFoundException } from "@chatbotx.io/business/errors"
import { sequenceRepository } from "@chatbotx.io/database/repositories"
import { getPaginationWithDefaults } from "@chatbotx.io/database/utils"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ListSequencesRequest,
  ListSequencesResponse,
} from "../schema/action"

export async function listSequences(
  input: ListSequencesRequest,
): Promise<ListSequencesResponse> {
  const pagination = getPaginationWithDefaults(input)

  const [data, total] = await Promise.all([
    sequenceRepository.listWithCounts(input),
    sequenceRepository.count(input),
  ])

  const pageCount = Math.ceil(total / pagination.limit)

  return { data, pageCount }
}

export async function getSequence(workspaceId: string, sequenceId: string) {
  await assertCurrentUserCanAccessChatbot(workspaceId)

  const sequence = await sequenceRepository.findWithSteps({
    id: sequenceId,
    workspaceId,
  })

  if (!sequence) {
    throw notFoundException("Sequence not found")
  }

  return {
    ...sequence,
    steps: sequence.sequenceSteps,
  }
}
