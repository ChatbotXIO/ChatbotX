import { getPollState } from "@chatbotx.io/business/poll"
import type { PollCandidateModel, PollModel } from "@chatbotx.io/database/types"

type PollRow = Pick<
  PollModel,
  | "id"
  | "name"
  | "imageUrl"
  | "startsAt"
  | "endsAt"
  | "afterVoteFlowId"
  | "createdAt"
  | "updatedAt"
>

const toBase = (poll: PollRow) => ({
  id: poll.id,
  name: poll.name,
  imageUrl: poll.imageUrl,
  startsAt: poll.startsAt.toISOString(),
  endsAt: poll.endsAt.toISOString(),
  afterVoteFlowId: poll.afterVoteFlowId ?? null,
  state: getPollState(poll),
  createdAt: poll.createdAt.toISOString(),
  updatedAt: poll.updatedAt.toISOString(),
})

export const toPollListItem = (poll: PollRow & { votesCount: number }) => ({
  ...toBase(poll),
  votesCount: poll.votesCount,
})

export const toPollResource = (
  poll: PollRow & {
    candidates: (PollCandidateModel & { votesCount: number })[]
  },
) => ({
  ...toBase(poll),
  candidates: poll.candidates.map((candidate) => ({
    id: candidate.id,
    position: candidate.position,
    name: candidate.name,
    description: candidate.description ?? null,
    imageUrl: candidate.imageUrl ?? null,
    votesCount: candidate.votesCount,
  })),
})

/** Wire (ISO strings) to service input (Dates). */
export const toPollDates = <T extends { startsAt?: string; endsAt?: string }>(
  input: T,
) => ({
  ...input,
  startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
  endsAt: input.endsAt ? new Date(input.endsAt) : undefined,
})
