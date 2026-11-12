import { type DatabaseClient, db, sql } from "../../client"

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

export const conversationParticipantRepository = { deleteByUserBatch }
