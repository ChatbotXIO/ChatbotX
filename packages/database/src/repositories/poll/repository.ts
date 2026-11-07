import { createId } from "@chatbotx.io/utils"
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  lte,
  sql,
} from "drizzle-orm"
import { type DatabaseClient, db } from "../../client"
import {
  contactModel,
  pollCandidateModel,
  pollModel,
  pollVoteModel,
} from "../../schema"
import type { PollCandidateModel, PollModel } from "../../types"
import {
  getPaginationWithDefaults,
  isBigintId,
  likeContains,
} from "../../utils"

export type PollCandidateInput = {
  name: string
  description?: string | null
  imageUrl?: string | null
}

export type PollInsertInput = {
  workspaceId: string
  name: string
  imageUrl: string
  startsAt: Date
  endsAt: Date
  afterVoteFlowId?: string | null
}

export type PollUpdateInput = Partial<
  Pick<
    PollModel,
    "name" | "imageUrl" | "startsAt" | "endsAt" | "afterVoteFlowId"
  >
>

export type PollWithCandidates = PollModel & {
  candidates: PollCandidateModel[]
}

export type PollVoteResult = "new" | "changed" | "unchanged"

/** `votedAt` is when the contact's current vote was cast or last changed. */
export type PollVoteOutcome = { result: PollVoteResult; votedAt: Date | null }

export type PollVoteBreakdownRow = {
  candidateId: string
  gender: "male" | "female" | "unknown"
  votes: number
}

const buildCandidateRows = (
  workspaceId: string,
  pollId: string,
  candidates: PollCandidateInput[],
) =>
  candidates.map((candidate, index) => ({
    workspaceId,
    pollId,
    position: index,
    name: candidate.name,
    description: candidate.description ?? null,
    imageUrl: candidate.imageUrl ?? null,
  }))

async function loadPollWithCandidates(
  input: { id: string; workspaceId?: string; forUpdate?: boolean },
  tx: DatabaseClient,
): Promise<PollWithCandidates | undefined> {
  // A crafted `pl_` ref can decode to an id outside the bigint range; treat it
  // as missing instead of letting the cast fail in SQL.
  if (!isBigintId(input.id)) {
    return
  }
  const query = tx
    .select()
    .from(pollModel)
    .where(
      and(
        eq(pollModel.id, input.id),
        input.workspaceId === undefined
          ? undefined
          : eq(pollModel.workspaceId, input.workspaceId),
      ),
    )
    .limit(1)
  const [poll] = input.forUpdate ? await query.for("update") : await query
  if (!poll) {
    return
  }
  const candidates = await tx
    .select()
    .from(pollCandidateModel)
    .where(eq(pollCandidateModel.pollId, poll.id))
    .orderBy(asc(pollCandidateModel.position))
  return { ...poll, candidates }
}

export const pollRepository = {
  async list(
    input: {
      workspaceId: string
      name?: string | null
      page: number
      perPage: number
    },
    tx: DatabaseClient = db,
  ): Promise<{
    data: (PollModel & { votesCount: number })[]
    pageCount: number
  }> {
    const pagination = getPaginationWithDefaults(input)
    const where = and(
      eq(pollModel.workspaceId, input.workspaceId),
      input.name ? ilike(pollModel.name, likeContains(input.name)) : undefined,
    )

    const [rows, totalRows] = await Promise.all([
      tx
        .select()
        .from(pollModel)
        .where(where)
        .orderBy(desc(pollModel.createdAt), desc(pollModel.id))
        .limit(pagination.limit)
        .offset(pagination.offset),
      tx.select({ count: count() }).from(pollModel).where(where),
    ])
    const total = Number(totalRows[0]?.count ?? 0)

    // A separate grouped query, not a correlated subquery in the select:
    // Drizzle strips table names from columns inside `sql` fields of a
    // single-table select, so `PollVote.pollId = Poll.id` would render as
    // `"pollId" = "id"` (both resolving to PollVote) and always count 0.
    const totals = rows.length
      ? await tx
          .select({ pollId: pollVoteModel.pollId, votes: count() })
          .from(pollVoteModel)
          .where(
            and(
              eq(pollVoteModel.workspaceId, input.workspaceId),
              inArray(
                pollVoteModel.pollId,
                rows.map((row) => row.id),
              ),
            ),
          )
          .groupBy(pollVoteModel.pollId)
      : []
    const votesByPoll = new Map(
      totals.map((row) => [row.pollId, Number(row.votes)]),
    )

    return {
      data: rows.map((row) => ({
        ...row,
        votesCount: votesByPoll.get(row.id) ?? 0,
      })),
      pageCount: Math.ceil(total / pagination.limit),
    }
  },

  /**
   * `forUpdate` locks the Poll row for the rest of the transaction, so
   * concurrent edits of the same poll serialize on it.
   */
  async findWithCandidates(
    input: { workspaceId: string; id: string; forUpdate?: boolean },
    tx: DatabaseClient = db,
  ): Promise<PollWithCandidates | undefined> {
    return await loadPollWithCandidates(input, tx)
  },

  /** For the worker, which checks the workspace itself. */
  async findUnscopedWithCandidates(
    id: string,
    tx: DatabaseClient = db,
  ): Promise<PollWithCandidates | undefined> {
    return await loadPollWithCandidates({ id }, tx)
  },

  async listRecent(
    input: { workspaceId: string; limit: number; runningAt?: Date },
    tx: DatabaseClient = db,
  ): Promise<PollModel[]> {
    return await tx
      .select()
      .from(pollModel)
      .where(
        and(
          eq(pollModel.workspaceId, input.workspaceId),
          input.runningAt
            ? and(
                lte(pollModel.startsAt, input.runningAt),
                gt(pollModel.endsAt, input.runningAt),
              )
            : undefined,
        ),
      )
      .orderBy(desc(pollModel.createdAt), desc(pollModel.id))
      .limit(input.limit)
  },

  async insertWithCandidates(
    input: PollInsertInput & { candidates: PollCandidateInput[] },
    tx: DatabaseClient = db,
  ): Promise<PollWithCandidates> {
    const { candidates, ...pollValues } = input
    const [poll] = await tx
      .insert(pollModel)
      .values({ ...pollValues, afterVoteFlowId: input.afterVoteFlowId ?? null })
      .returning()
    if (!poll) {
      throw new Error("Failed to insert poll")
    }
    const inserted = candidates.length
      ? await tx
          .insert(pollCandidateModel)
          .values(buildCandidateRows(input.workspaceId, poll.id, candidates))
          .returning()
      : []
    return {
      ...poll,
      candidates: inserted.sort((a, b) => a.position - b.position),
    }
  },

  async updateCandidate(
    input: {
      workspaceId: string
      pollId: string
      id: string
      position: number
      candidate: PollCandidateInput
    },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(pollCandidateModel)
      .set({
        position: input.position,
        name: input.candidate.name,
        description: input.candidate.description ?? null,
        imageUrl: input.candidate.imageUrl ?? null,
      })
      .where(
        and(
          eq(pollCandidateModel.id, input.id),
          eq(pollCandidateModel.pollId, input.pollId),
          eq(pollCandidateModel.workspaceId, input.workspaceId),
        ),
      )
  },

  /** Inserts candidates at explicit positions (used when editing a poll). */
  async insertCandidates(
    input: {
      workspaceId: string
      pollId: string
      candidates: (PollCandidateInput & { position: number })[]
    },
    tx: DatabaseClient = db,
  ): Promise<PollCandidateModel[]> {
    if (!input.candidates.length) {
      return []
    }
    return await tx
      .insert(pollCandidateModel)
      .values(
        input.candidates.map((candidate) => ({
          workspaceId: input.workspaceId,
          pollId: input.pollId,
          position: candidate.position,
          name: candidate.name,
          description: candidate.description ?? null,
          imageUrl: candidate.imageUrl ?? null,
        })),
      )
      .returning()
  },

  /** Deletes candidates; their votes go with them through the cascade. */
  async deleteCandidates(
    input: { workspaceId: string; pollId: string; ids: string[] },
    tx: DatabaseClient = db,
  ): Promise<void> {
    if (!input.ids.length) {
      return
    }
    await tx
      .delete(pollCandidateModel)
      .where(
        and(
          eq(pollCandidateModel.pollId, input.pollId),
          eq(pollCandidateModel.workspaceId, input.workspaceId),
          inArray(pollCandidateModel.id, input.ids),
        ),
      )
  },

  async update(
    input: { workspaceId: string; id: string; data: PollUpdateInput },
    tx: DatabaseClient = db,
  ): Promise<PollModel | undefined> {
    const [row] = await tx
      .update(pollModel)
      .set(input.data)
      .where(
        and(
          eq(pollModel.id, input.id),
          eq(pollModel.workspaceId, input.workspaceId),
        ),
      )
      .returning()
    return row
  },

  async deleteMany(
    input: { workspaceId: string; ids: string[] },
    tx: DatabaseClient = db,
  ): Promise<number> {
    if (!input.ids.length) {
      return 0
    }
    const rows = await tx
      .delete(pollModel)
      .where(
        and(
          eq(pollModel.workspaceId, input.workspaceId),
          inArray(pollModel.id, input.ids),
        ),
      )
      .returning({ id: pollModel.id })
    return rows.length
  },

  /**
   * Single-statement vote upsert (race-safe: the unique `(pollId, contactId)`
   * index arbitrates concurrent votes). No row back means the vote already
   * pointed at this candidate.
   */
  async upsertVote(
    input: {
      workspaceId: string
      pollId: string
      candidateId: string
      contactId: string
      contactInboxId?: string | null
    },
    tx: DatabaseClient = db,
  ): Promise<PollVoteOutcome> {
    const contactInboxId = input.contactInboxId ?? null
    // An unchanged vote returns no row from the upsert, so the existing row is
    // read in the same statement to report when the current vote was cast.
    const result = await tx.execute<{
      inserted: boolean | null
      votedAt: Date | string
    }>(sql`
      WITH upsert AS (
        INSERT INTO "PollVote" ("id", "workspaceId", "pollId", "candidateId", "contactId", "contactInboxId")
        VALUES (${createId()}, ${input.workspaceId}, ${input.pollId}, ${input.candidateId}, ${input.contactId}, ${contactInboxId})
        ON CONFLICT ("pollId", "contactId") DO UPDATE
          SET "candidateId" = EXCLUDED."candidateId",
              "contactInboxId" = EXCLUDED."contactInboxId",
              "updatedAt" = now()
          WHERE "PollVote"."candidateId" IS DISTINCT FROM EXCLUDED."candidateId"
        RETURNING (xmax = 0) AS inserted, "updatedAt" AS "votedAt"
      )
      SELECT inserted, "votedAt" FROM upsert
      UNION ALL
      SELECT NULL AS inserted, "updatedAt" AS "votedAt"
      FROM "PollVote"
      WHERE "pollId" = ${input.pollId}
        AND "contactId" = ${input.contactId}
        AND NOT EXISTS (SELECT 1 FROM upsert)
    `)
    const row = result.rows[0]
    if (!row) {
      // The conflicting row was committed by a concurrent vote this statement's
      // snapshot cannot see; that vote owns the follow-up.
      return { result: "unchanged", votedAt: null }
    }
    const votedAt = new Date(row.votedAt)
    if (row.inserted === null) {
      return { result: "unchanged", votedAt }
    }
    return { result: row.inserted ? "new" : "changed", votedAt }
  },

  /** Votes per candidate; the cheap path when the gender split is not needed. */
  async voteCounts(
    input: { workspaceId: string; pollId: string },
    tx: DatabaseClient = db,
  ): Promise<{ candidateId: string; votes: number }[]> {
    const rows = await tx
      .select({ candidateId: pollVoteModel.candidateId, votes: count() })
      .from(pollVoteModel)
      .where(
        and(
          eq(pollVoteModel.workspaceId, input.workspaceId),
          eq(pollVoteModel.pollId, input.pollId),
        ),
      )
      .groupBy(pollVoteModel.candidateId)
    return rows.map((row) => ({ ...row, votes: Number(row.votes) }))
  },

  async voteBreakdown(
    input: { workspaceId: string; pollId: string },
    tx: DatabaseClient = db,
  ): Promise<PollVoteBreakdownRow[]> {
    const gender = sql<
      "male" | "female" | "unknown"
    >`coalesce(${contactModel.gender}::text, 'unknown')`
    const rows = await tx
      .select({
        candidateId: pollVoteModel.candidateId,
        gender,
        votes: count(),
      })
      .from(pollVoteModel)
      .innerJoin(contactModel, eq(contactModel.id, pollVoteModel.contactId))
      .where(
        and(
          eq(pollVoteModel.workspaceId, input.workspaceId),
          eq(pollVoteModel.pollId, input.pollId),
        ),
      )
      .groupBy(pollVoteModel.candidateId, gender)
    return rows.map((row) => ({ ...row, votes: Number(row.votes) }))
  },
}
