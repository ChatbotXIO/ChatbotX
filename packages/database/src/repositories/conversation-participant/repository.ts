import { type DatabaseClient, db, lt, or, sql } from "../../client"
import { RECENT_PARTICIPANT_LIMIT } from "../../partials"
import { conversationParticipantModel } from "../../schema"

export type RecordReplyInput = {
  workspaceId: string
  conversationId: string
  userId: string
  at: Date
}

export type ParticipantListCursor = { lastRepliedAt: Date; userId: string }

/** The member columns exposed with a participant; never secret columns. */
const participantUserColumns = {
  id: true,
  name: true,
  image: true,
} as const

/**
 * RQB `with` config for a conversation's most recent repliers: one nested
 * lateral subquery in the statement that loads the conversation, so no extra
 * round trip and no N+1. Shared by every conversation read.
 */
export const recentParticipantsRelation = {
  columns: { userId: true, lastRepliedAt: true },
  where: { lastRepliedAt: { isNotNull: true } },
  orderBy: { lastRepliedAt: "desc", userId: "desc" },
  limit: RECENT_PARTICIPANT_LIMIT,
  with: { user: { columns: participantUserColumns } },
} as const

export type ListRepliedInput = {
  workspaceId: string
  conversationId: string
  cursor?: ParticipantListCursor
  limit: number
}

/**
 * Records that a member replied. One statement; the unique key arbitrates
 * concurrent callers. Monotonic: an older or equal `at` (a retry, a duplicate
 * or an out-of-order event) updates nothing and returns `false`.
 */
const upsertReply = async (
  input: RecordReplyInput,
  tx: DatabaseClient = db,
): Promise<boolean> => {
  const rows = await tx
    .insert(conversationParticipantModel)
    .values({
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      userId: input.userId,
      lastRepliedAt: input.at,
    })
    .onConflictDoUpdate({
      target: [
        conversationParticipantModel.conversationId,
        conversationParticipantModel.userId,
      ],
      set: {
        lastRepliedAt: sql`excluded."lastRepliedAt"`,
        updatedAt: sql`now()`,
      },
      setWhere: or(
        sql`${conversationParticipantModel.lastRepliedAt} IS NULL`,
        lt(
          conversationParticipantModel.lastRepliedAt,
          sql`excluded."lastRepliedAt"`,
        ),
      ),
    })
    .returning({ id: conversationParticipantModel.id })

  return rows.length > 0
}

/**
 * Members who replied, newest first. Keyset pagination over
 * `(lastRepliedAt, userId)`, served by the `(conversationId, userId)` unique
 * index; a conversation has few rows. Never selects secret user columns.
 */
const listRepliedByConversation = async (
  input: ListRepliedInput,
  tx: DatabaseClient = db,
) => {
  const { cursor } = input
  const rows = await tx.query.conversationParticipantModel.findMany({
    columns: { userId: true, lastRepliedAt: true },
    where: {
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      lastRepliedAt: { isNotNull: true },
      ...(cursor && {
        OR: [
          { lastRepliedAt: { lt: cursor.lastRepliedAt } },
          {
            lastRepliedAt: { eq: cursor.lastRepliedAt },
            userId: { lt: cursor.userId },
          },
        ],
      }),
    },
    orderBy: { lastRepliedAt: "desc", userId: "desc" },
    limit: input.limit,
    with: { user: { columns: participantUserColumns } },
  })

  return rows.flatMap(({ lastRepliedAt, user, userId }) =>
    lastRepliedAt ? [{ userId, lastRepliedAt, user }] : [],
  )
}

const deleteByUserBatch = async (
  userId: string,
  limit: number,
  tx: DatabaseClient = db,
): Promise<number> => {
  const result = await tx.execute<{ id: string }>(sql`
    WITH batch AS (
      SELECT "id"
      FROM "ConversationParticipant"
      WHERE "userId" = ${userId}
      ORDER BY "id"
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    DELETE FROM "ConversationParticipant"
    USING batch
    WHERE "ConversationParticipant"."id" = batch."id"
    RETURNING "ConversationParticipant"."id"
  `)

  return result.rows.length
}

export const conversationParticipantRepository = {
  deleteByUserBatch,
  listRepliedByConversation,
  upsertReply,
}
