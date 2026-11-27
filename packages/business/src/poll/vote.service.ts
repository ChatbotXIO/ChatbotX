import { isForeignKeyViolationError } from "@chatbotx.io/database/client"
import {
  flowRepository,
  type PollVoteOutcome,
  type PollVoteResult,
  type PollWithCandidates,
  pollRepository,
} from "@chatbotx.io/database/repositories"
import { BaseService } from "../base.service"
import { getPollState } from "./state"

export type CastVoteInput = {
  workspaceId: string
  pollId: string
  candidateId: string
  contactId: string
  contactInboxId?: string | null
}

export type CastVoteOutcome =
  | {
      result: PollVoteResult
      afterVoteFlowId: string | null
      /** Dedup key for the after-vote flow job, set with `afterVoteFlowId`. */
      afterVoteFlowJobId: string | null
    }
  | { rejected: "pollNotFound" }
  | {
      rejected: "candidateNotFound" | "notRunning"
      /** The workspace-scoped poll the vote was checked against. */
      poll: PollWithCandidates
    }

/**
 * How long after a vote an "unchanged" re-tap still re-attempts the after-vote
 * flow. Covers a job retry (BullMQ backoff is seconds) after the vote committed
 * but the flow enqueue failed; the deterministic job id keeps a real double tap
 * inside this window from running the flow twice.
 */
const AFTER_VOTE_RETRY_WINDOW_MS = 2 * 60_000

const CANDIDATE_FOREIGN_KEY = "PollVote_candidateId_PollCandidate_id_fkey"

class PollVoteService extends BaseService {
  /**
   * The flow to run after a vote: only for a new or changed vote (or a retry
   * shortly after one, see `AFTER_VOTE_RETRY_WINDOW_MS`), and only if the
   * configured flow still exists in the workspace (it can be deleted after the
   * poll was set up).
   */
  private async resolveAfterVoteFlow(
    workspaceId: string,
    vote: PollVoteOutcome,
    flowId: string | null,
  ): Promise<string | null> {
    if (!(flowId && vote.votedAt)) {
      return null
    }
    if (
      vote.result === "unchanged" &&
      Date.now() - vote.votedAt.getTime() > AFTER_VOTE_RETRY_WINDOW_MS
    ) {
      return null
    }
    const exists = await flowRepository.existsInWorkspace({
      workspaceId,
      id: flowId,
    })
    return exists ? flowId : null
  }

  /**
   * The repository upsert checks neither the window nor that the candidate
   * belongs to the poll, so both are validated here against a workspace-scoped
   * reload before voting.
   */
  async castVote(input: CastVoteInput): Promise<CastVoteOutcome> {
    const poll = await pollRepository.findWithCandidates({
      workspaceId: input.workspaceId,
      id: input.pollId,
    })
    if (!poll) {
      return { rejected: "pollNotFound" }
    }
    if (getPollState(poll) !== "running") {
      return { rejected: "notRunning", poll }
    }
    if (
      !poll.candidates.some((candidate) => candidate.id === input.candidateId)
    ) {
      return { rejected: "candidateNotFound", poll }
    }
    try {
      const vote = await pollRepository.upsertVote(input)
      const afterVoteFlowId = await this.resolveAfterVoteFlow(
        input.workspaceId,
        vote,
        poll.afterVoteFlowId,
      )
      return {
        result: vote.result,
        afterVoteFlowId,
        afterVoteFlowJobId:
          afterVoteFlowId && vote.votedAt
            ? `poll-vote-flow-${input.pollId}-${input.contactId}-${vote.votedAt.getTime()}`
            : null,
      }
    } catch (error) {
      // The candidate was deleted between the reload and the upsert. Any other
      // foreign key (poll, contact, inbox) is not a stale tap: let it throw.
      if (isForeignKeyViolationError(error, CANDIDATE_FOREIGN_KEY)) {
        // The loaded poll still lists the deleted candidate: reload it so the
        // resent candidates are current.
        const fresh = await pollRepository.findWithCandidates({
          workspaceId: input.workspaceId,
          id: input.pollId,
        })
        return fresh
          ? { rejected: "candidateNotFound", poll: fresh }
          : { rejected: "pollNotFound" }
      }
      throw error
    }
  }
}

export const pollVoteService = new PollVoteService()
