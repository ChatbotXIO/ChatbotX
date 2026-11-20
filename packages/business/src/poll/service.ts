import type { DatabaseClient } from "@chatbotx.io/database/client"
import {
  flowRepository,
  type PollCandidateInput,
  type PollWithCandidates,
  pollRepository,
} from "@chatbotx.io/database/repositories"
import { BaseService } from "../base.service"
import { ChatbotXException, notFoundException } from "../errors"
import {
  assertReferencable,
  assertResourceEditable,
  changedKeysOf,
  withDeleteGuard,
} from "../template/installed-resource.service"
import { withTemplateLockedTransaction } from "../template/template-resource-locks"
import { computePollAnalytics } from "./analytics"

/**
 * A template-installed flow being uninstalled can not become a poll's
 * after-vote flow: the reference waits on, or is refused by, its lock.
 */
const assertAfterVoteFlowReferencable = async (
  workspaceId: string,
  flowId: string | null | undefined,
  tx: DatabaseClient,
): Promise<void> => {
  if (flowId) {
    await assertReferencable({
      workspaceId,
      parents: [{ kind: "flow", resourceId: flowId }],
      tx,
    })
  }
}

export const POLL_MIN_CANDIDATES = 2
export const POLL_MAX_CANDIDATES = 10

type PollFields = {
  name: string
  imageUrl: string
  startsAt: Date
  endsAt: Date
  afterVoteFlowId?: string | null
}

export type PollCreateInput = PollFields & {
  workspaceId: string
  candidates: PollCandidateInput[]
}

export type PollUpdateData = Partial<PollFields> & {
  candidates?: (PollCandidateInput & { id?: string })[]
}

const assertDateRange = (startsAt: Date, endsAt: Date) => {
  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new ChatbotXException(
      "Poll end must be after its start",
      "pollInvalidDateRange",
      400,
    )
  }
}

const assertCandidateCount = (count: number) => {
  if (count < POLL_MIN_CANDIDATES || count > POLL_MAX_CANDIDATES) {
    throw new ChatbotXException(
      `A poll needs between ${POLL_MIN_CANDIDATES} and ${POLL_MAX_CANDIDATES} candidates`,
      "pollCandidateCount",
      400,
    )
  }
}

const assertPollShape = (input: PollCreateInput) => {
  assertDateRange(input.startsAt, input.endsAt)
  assertCandidateCount(input.candidates.length)
}

/**
 * True when the submitted candidates differ in content or order from the stored
 * ones, or name a stored candidate at another position. A list that is not
 * changed (ids omitted or the same) is left alone: replacing it would delete
 * the stored rows, and with them their votes.
 */
const candidatesChanged = (
  stored: readonly (PollCandidateInput & { id?: string })[],
  submitted: readonly (PollCandidateInput & { id?: string })[],
): boolean => {
  const content = (candidate: PollCandidateInput) =>
    JSON.stringify([
      candidate.name,
      candidate.description ?? null,
      candidate.imageUrl ?? null,
    ])
  return (
    stored.length !== submitted.length ||
    stored.some(
      (candidate, index) =>
        content(candidate) !== content(submitted[index]) ||
        (submitted[index].id !== undefined &&
          submitted[index].id !== candidate.id),
    )
  )
}

class PollService extends BaseService {
  list(input: {
    workspaceId: string
    name?: string
    page?: number
    perPage?: number
  }) {
    return pollRepository.list({
      workspaceId: input.workspaceId,
      name: input.name,
      page: input.page ?? 1,
      perPage: input.perPage ?? 10,
    })
  }

  async find(input: {
    workspaceId: string
    id: string
  }): Promise<PollWithCandidates> {
    const poll = await pollRepository.findWithCandidates(input)
    if (!poll) {
      throw notFoundException("Poll not found")
    }
    return poll
  }

  /** For the worker, which checks the workspace itself. */
  findUnscopedWithCandidates(id: string) {
    return pollRepository.findUnscopedWithCandidates(id)
  }

  /** Newest first; `runningAt` keeps only polls running at that instant. */
  listRecent(input: { workspaceId: string; limit: number; runningAt?: Date }) {
    return pollRepository.listRecent(input)
  }

  /** `find` plus each candidate's `votesCount`. */
  async findWithVoteCounts(input: { workspaceId: string; id: string }) {
    return await this.withVoteCounts(await this.find(input))
  }

  /** Attaches each candidate's `votesCount` to an already-loaded poll. */
  async withVoteCounts(poll: PollWithCandidates): Promise<
    PollWithCandidates & {
      candidates: (PollWithCandidates["candidates"][number] & {
        votesCount: number
      })[]
    }
  > {
    const counts = await pollRepository.voteCounts({
      workspaceId: poll.workspaceId,
      pollId: poll.id,
    })
    const totals = new Map(counts.map((row) => [row.candidateId, row.votes]))
    return {
      ...poll,
      candidates: poll.candidates.map((candidate) => ({
        ...candidate,
        votesCount: totals.get(candidate.id) ?? 0,
      })),
    }
  }

  private async assertFlowInWorkspace(
    workspaceId: string,
    flowId: string | null | undefined,
  ) {
    if (!flowId) {
      return
    }
    const exists = await flowRepository.existsInWorkspace({
      workspaceId,
      id: flowId,
    })
    if (!exists) {
      throw new ChatbotXException("Flow not found", "pollFlowNotFound", 400)
    }
  }

  /**
   * The insert core (shape rules plus the row write), shared with the template
   * install so there is one implementation. Reference checks and template
   * guards stay outside it.
   */
  insertInTx(
    tx: DatabaseClient,
    input: PollCreateInput,
  ): Promise<PollWithCandidates> {
    assertPollShape(input)
    return pollRepository.insertWithCandidates(input, tx)
  }

  async create(input: PollCreateInput): Promise<PollWithCandidates> {
    assertPollShape(input)
    await this.assertFlowInWorkspace(input.workspaceId, input.afterVoteFlowId)
    return await withTemplateLockedTransaction(async (tx) => {
      await assertAfterVoteFlowReferencable(
        input.workspaceId,
        input.afterVoteFlowId,
        tx,
      )
      return await this.insertInTx(tx, input)
    })
  }

  async update(input: {
    workspaceId: string
    id: string
    data: PollUpdateData
  }): Promise<PollWithCandidates> {
    const { candidates, ...fields } = input.data
    const { workspaceId, id } = input

    return await withTemplateLockedTransaction(
      async (tx) => {
        // Lock the poll row: the candidate-count and kept-id checks below read a
        // snapshot that a concurrent edit must not change underneath them.
        const current = await pollRepository.findWithCandidates(
          { workspaceId, id, forUpdate: true },
          tx,
        )
        if (!current) {
          throw notFoundException("Poll not found")
        }

        assertDateRange(
          fields.startsAt ?? current.startsAt,
          fields.endsAt ?? current.endsAt,
        )
        const replacesCandidates = Boolean(
          candidates && candidatesChanged(current.candidates, candidates),
        )
        await assertResourceEditable({
          workspaceId,
          resourceKind: "poll",
          resourceIds: [id],
          changedKeys: [
            ...changedKeysOf(current, fields),
            ...(replacesCandidates ? ["candidates"] : []),
          ],
          referencedParents: fields.afterVoteFlowId
            ? [{ kind: "flow", resourceId: fields.afterVoteFlowId }]
            : [],
          tx,
        })
        if (fields.afterVoteFlowId) {
          await this.assertFlowInWorkspace(workspaceId, fields.afterVoteFlowId)
          await assertAfterVoteFlowReferencable(
            workspaceId,
            fields.afterVoteFlowId,
            tx,
          )
        }

        if (candidates && replacesCandidates) {
          assertCandidateCount(candidates.length)
          const existingIds = new Set(current.candidates.map((c) => c.id))
          const keptIds = new Set<string>()
          for (const candidate of candidates) {
            if (candidate.id === undefined) {
              continue
            }
            if (!existingIds.has(candidate.id) || keptIds.has(candidate.id)) {
              throw new ChatbotXException(
                "Candidate does not belong to this poll",
                "pollCandidateNotInPoll",
                400,
              )
            }
            keptIds.add(candidate.id)
          }

          // Delete first so removed candidates (and their votes) are gone before
          // positions are reassigned.
          await pollRepository.deleteCandidates(
            {
              workspaceId,
              pollId: id,
              ids: [...existingIds].filter((cid) => !keptIds.has(cid)),
            },
            tx,
          )

          const toInsert: (PollCandidateInput & { position: number })[] = []
          for (const [position, candidate] of candidates.entries()) {
            if (candidate.id === undefined) {
              toInsert.push({ ...candidate, position })
              continue
            }
            await pollRepository.updateCandidate(
              {
                workspaceId,
                pollId: id,
                id: candidate.id,
                position,
                candidate,
              },
              tx,
            )
          }
          await pollRepository.insertCandidates(
            { workspaceId, pollId: id, candidates: toInsert },
            tx,
          )
        }

        // A zod-parsed partial carries `undefined` for omitted keys; drizzle
        // throws "No values to set" when every value is undefined.
        const definedFields = Object.fromEntries(
          Object.entries(fields).filter(([, value]) => value !== undefined),
        )
        if (Object.keys(definedFields).length > 0) {
          await pollRepository.update(
            { workspaceId, id, data: definedFields },
            tx,
          )
        }

        const updated = await pollRepository.findWithCandidates(
          { workspaceId, id },
          tx,
        )
        if (!updated) {
          throw notFoundException("Poll not found")
        }
        return updated
      },
      {
        workspaceId,
        initialKeys: [
          { kind: "poll", resourceId: id },
          ...(fields.afterVoteFlowId
            ? [{ kind: "flow" as const, resourceId: fields.afterVoteFlowId }]
            : []),
        ],
      },
    )
  }

  async delete(input: { workspaceId: string; id: string }): Promise<void> {
    const { deleted } = await this.bulkDelete({
      workspaceId: input.workspaceId,
      ids: [input.id],
    })
    if (deleted === 0) {
      throw notFoundException("Poll not found")
    }
  }

  async bulkDelete(input: {
    workspaceId: string
    ids: string[]
  }): Promise<{ deleted: number }> {
    const deleted = await withDeleteGuard(
      {
        workspaceId: input.workspaceId,
        targets: [{ resourceKind: "poll", resourceIds: input.ids }],
      },
      (tx) => this.deleteInTx(tx, input),
    )
    return { deleted: deleted.length }
  }

  /**
   * The delete core (row write only; candidates and votes cascade), shared with
   * the template uninstall so there is one implementation. Returns the ids deleted.
   */
  deleteInTx(
    tx: DatabaseClient,
    input: { workspaceId: string; ids: string[] },
  ): Promise<string[]> {
    return pollRepository.deleteManyReturningIds(input, tx)
  }

  /**
   * Vote analytics plus the poll's header fields, so the analytics page needs
   * this one call instead of also fetching the poll (a second breakdown).
   */
  async getAnalytics(input: { workspaceId: string; id: string }) {
    const [poll, breakdown] = await Promise.all([
      this.find(input),
      pollRepository.voteBreakdown({
        workspaceId: input.workspaceId,
        pollId: input.id,
      }),
    ])
    return {
      ...computePollAnalytics(poll, breakdown),
      poll: {
        id: poll.id,
        name: poll.name,
        imageUrl: poll.imageUrl,
        startsAt: poll.startsAt,
        endsAt: poll.endsAt,
      },
    }
  }
}

export const pollService = new PollService()
